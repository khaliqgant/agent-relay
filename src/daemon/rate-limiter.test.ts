import { describe, it, expect, vi } from 'vitest';
import { RateLimiter, NoOpRateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from './rate-limiter.js';

describe('RateLimiter', () => {
  describe('token bucket behavior', () => {
    it('allows first message with full bucket', () => {
      const limiter = new RateLimiter();

      const result = limiter.tryAcquireWithResult('agent-a');

      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(DEFAULT_RATE_LIMIT_CONFIG.burstSize - 1);
    });

    it('allows burst up to bucket size', () => {
      const limiter = new RateLimiter({
        burstSize: 5,
        messagesPerSecond: 1,
        logEvents: false,
      });

      // Should allow 5 messages immediately
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire('agent-a')).toBe(true);
      }

      // 6th should be blocked
      expect(limiter.tryAcquire('agent-a')).toBe(false);
    });

    it('refills tokens over time', async () => {
      vi.useFakeTimers();
      try {
        const limiter = new RateLimiter({
          burstSize: 2,
          messagesPerSecond: 10, // 10 tokens per second = 1 token per 100ms
          logEvents: false,
        });

        // Exhaust tokens
        expect(limiter.tryAcquire('agent-a')).toBe(true);
        expect(limiter.tryAcquire('agent-a')).toBe(true);
        expect(limiter.tryAcquire('agent-a')).toBe(false);

        // Wait for 1 token to refill (100ms at 10/sec)
        await vi.advanceTimersByTimeAsync(100);

        // Should now be able to send 1 more
        expect(limiter.tryAcquire('agent-a')).toBe(true);
        expect(limiter.tryAcquire('agent-a')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('caps tokens at burst size', async () => {
      vi.useFakeTimers();
      try {
        const limiter = new RateLimiter({
          burstSize: 3,
          messagesPerSecond: 100,
          logEvents: false,
        });

        // Use 1 token
        limiter.tryAcquire('agent-a');

        // Wait a long time - should cap at burst size
        await vi.advanceTimersByTimeAsync(10000);

        // Should have exactly burst size tokens
        expect(limiter.getRemainingTokens('agent-a')).toBe(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns retry time when rate limited', () => {
      const limiter = new RateLimiter({
        burstSize: 1,
        messagesPerSecond: 10, // 100ms per token
        logEvents: false,
      });

      // Exhaust tokens
      limiter.tryAcquire('agent-a');

      const result = limiter.tryAcquireWithResult('agent-a');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeLessThanOrEqual(100); // ~100ms for 10 tokens/sec
    });

    it('handles rapid successive calls correctly', () => {
      const limiter = new RateLimiter({
        burstSize: 100,
        messagesPerSecond: 50,
        logEvents: false,
      });

      // Rapid fire 50 calls
      let allowed = 0;
      for (let i = 0; i < 50; i++) {
        if (limiter.tryAcquire('agent-a')) {
          allowed++;
        }
      }

      expect(allowed).toBe(50);
    });

    it('handles exactly 1.0 tokens boundary', async () => {
      vi.useFakeTimers();
      try {
        const limiter = new RateLimiter({
          burstSize: 1,
          messagesPerSecond: 10, // 100ms per token
          logEvents: false,
        });

        // Exhaust token
        expect(limiter.tryAcquire('agent-a')).toBe(true);
        expect(limiter.tryAcquire('agent-a')).toBe(false);

        // Wait exactly enough for 1 token
        await vi.advanceTimersByTimeAsync(100);

        // Should have exactly 1.0 tokens - should allow
        expect(limiter.tryAcquire('agent-a')).toBe(true);
        expect(limiter.tryAcquire('agent-a')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('per-agent tracking', () => {
    it('tracks separate buckets per agent', () => {
      const limiter = new RateLimiter({
        burstSize: 2,
        messagesPerSecond: 1,
        logEvents: false,
      });

      // Exhaust agent-a's tokens
      limiter.tryAcquire('agent-a');
      limiter.tryAcquire('agent-a');
      expect(limiter.tryAcquire('agent-a')).toBe(false);

      // agent-b should still have full bucket
      expect(limiter.tryAcquire('agent-b')).toBe(true);
      expect(limiter.tryAcquire('agent-b')).toBe(true);
    });

    it('returns full bucket for new agents', () => {
      const limiter = new RateLimiter({
        burstSize: 10,
        logEvents: false,
      });

      expect(limiter.getRemainingTokens('new-agent')).toBe(10);
    });
  });

  describe('reset functionality', () => {
    it('reset clears single agent', () => {
      const limiter = new RateLimiter({
        burstSize: 5,
        logEvents: false,
      });

      // Use some tokens
      limiter.tryAcquire('agent-a');
      limiter.tryAcquire('agent-a');
      limiter.tryAcquire('agent-a');

      expect(limiter.getRemainingTokens('agent-a')).toBe(2);

      limiter.reset('agent-a');

      // Should have full bucket again
      expect(limiter.getRemainingTokens('agent-a')).toBe(5);
    });

    it('resetAll clears all agents', () => {
      const limiter = new RateLimiter({
        burstSize: 5,
        logEvents: false,
      });

      limiter.tryAcquire('agent-a');
      limiter.tryAcquire('agent-b');
      limiter.tryAcquire('agent-c');

      const stats = limiter.getStats();
      expect(stats.agentCount).toBe(3);

      limiter.resetAll();

      expect(limiter.getStats().agentCount).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('removes stale agent buckets', async () => {
      vi.useFakeTimers();
      try {
        const limiter = new RateLimiter({
          burstSize: 5,
          logEvents: false,
        });

        // Create some buckets
        limiter.tryAcquire('agent-a');
        limiter.tryAcquire('agent-b');

        // Advance time past max age
        await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000); // 2 hours

        const cleaned = limiter.cleanup(60 * 60 * 1000); // 1 hour max age

        expect(cleaned).toBe(2);
        expect(limiter.getStats().agentCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('preserves recent buckets during cleanup', async () => {
      vi.useFakeTimers();
      try {
        const limiter = new RateLimiter({
          burstSize: 5,
          logEvents: false,
        });

        limiter.tryAcquire('old-agent');

        // Advance time
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000); // 30 min

        // This agent is recent - consume a token
        limiter.tryAcquire('new-agent');

        // Advance a bit more
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000); // 10 more min

        const cleaned = limiter.cleanup(35 * 60 * 1000); // 35 min max age

        expect(cleaned).toBe(1); // Only old-agent
        expect(limiter.getStats().agentCount).toBe(1);
        // new-agent bucket still exists (not cleaned up)
        expect(limiter.getRemainingTokens('new-agent')).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getStats', () => {
    it('returns agent count and config', () => {
      const limiter = new RateLimiter({
        messagesPerSecond: 100,
        burstSize: 200,
        logEvents: false,
      });

      limiter.tryAcquire('agent-1');
      limiter.tryAcquire('agent-2');

      const stats = limiter.getStats();

      expect(stats.agentCount).toBe(2);
      expect(stats.config.messagesPerSecond).toBe(100);
      expect(stats.config.burstSize).toBe(200);
    });
  });
});

describe('NoOpRateLimiter', () => {
  it('always allows messages', () => {
    const limiter = new NoOpRateLimiter();

    // Should always return true
    for (let i = 0; i < 1000; i++) {
      expect(limiter.tryAcquire('any-agent')).toBe(true);
    }
  });

  it('returns infinity for remaining tokens', () => {
    const limiter = new NoOpRateLimiter();

    const result = limiter.tryAcquireWithResult('agent');

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(Infinity);
  });
});

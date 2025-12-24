import { describe, expect, it } from 'vitest';
import { computeNeedsAttention, type AttentionMessage } from './needs-attention.js';

const baseTs = Date.now();

const msg = (overrides: Partial<AttentionMessage>): AttentionMessage => ({
  from: 'A',
  to: 'B',
  timestamp: new Date(baseTs).toISOString(),
  ...overrides,
});

describe('computeNeedsAttention', () => {
  it('flags agents with inbound messages and no reply', () => {
    const messages: AttentionMessage[] = [
      msg({ from: 'Alice', to: 'Bob', timestamp: new Date(baseTs).toISOString() }),
    ];

    const result = computeNeedsAttention(messages);
    expect(result.has('Bob')).toBe(true);
    expect(result.has('Alice')).toBe(false);
  });

  it('clears attention when agent replies to sender', () => {
    const messages: AttentionMessage[] = [
      msg({ from: 'Alice', to: 'Bob', timestamp: new Date(baseTs).toISOString() }),
      msg({ from: 'Bob', to: 'Alice', timestamp: new Date(baseTs + 1000).toISOString() }),
    ];

    const result = computeNeedsAttention(messages);
    expect(result.has('Bob')).toBe(false);
  });

  it('tracks per-sender so replying elsewhere does not clear attention', () => {
    const messages: AttentionMessage[] = [
      msg({ from: 'Alice', to: 'Bob', timestamp: new Date(baseTs).toISOString() }),
      msg({ from: 'Bob', to: 'Carol', timestamp: new Date(baseTs + 1000).toISOString() }),
    ];

    const result = computeNeedsAttention(messages);
    expect(result.has('Bob')).toBe(true);
  });

  it('uses thread ID as the conversation key (broadcast replies count)', () => {
    const threadId = 'thread-123';
    const messages: AttentionMessage[] = [
      msg({ from: 'Alice', to: 'Bob', thread: threadId, timestamp: new Date(baseTs).toISOString() }),
      msg({ from: 'Bob', to: '*', thread: threadId, timestamp: new Date(baseTs + 2000).toISOString() }),
    ];

    const result = computeNeedsAttention(messages);
    expect(result.has('Bob')).toBe(false);
  });

  it('ignores broadcasts without thread', () => {
    const messages: AttentionMessage[] = [
      msg({ from: 'Alice', to: 'Bob', timestamp: new Date(baseTs).toISOString() }),
      msg({ from: 'Bob', to: '*', timestamp: new Date(baseTs + 1000).toISOString() }),
    ];

    const result = computeNeedsAttention(messages);
    expect(result.has('Bob')).toBe(true);
  });
});

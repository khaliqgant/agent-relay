# Proposal: Robust Context Injection for Agent Startup

**Status**: Draft
**Author**: Claude
**Date**: 2026-01-10
**Problem**: Startup context injection is unreliable - agents often ignore or never receive it

## Problem Statement

When agents start, we try to inject context from previous sessions (continuity data, task context, code search results). This frequently fails because:

1. **Bad timing**: We inject after arbitrary 3s delay, but agent may not be ready
2. **Idle requirement**: We wait for agent to be "idle" (no output for 1.5s), but agents generating responses are never idle
3. **No feedback**: We don't know if agent received the context
4. **Queue starvation**: Context sits in queue while agent is busy

## Current Architecture

```typescript
// tmux-wrapper.ts:454
setTimeout(() => this.injectInstructions(), 3000);

// tmux-wrapper.ts:578-584
this.messageQueue.push({
  from: 'system',
  body: context.formatted,
  messageId: `continuity-startup-${Date.now()}`,
});
this.checkForInjectionOpportunity();

// tmux-wrapper.ts:1381
const timeSinceOutput = Date.now() - this.lastOutputTime;
if (timeSinceOutput < (this.config.idleBeforeInjectMs ?? 1500)) {
  // Retry later...
}
```

## Proposed Solution: Multi-Stage Injection with Acknowledgment

### Stage 1: Universal Idle Detection

The core problem: detecting when ANY agent (Claude, Codex, Gemini, Aider, etc.) is waiting for input. Pattern matching fails because each CLI has different prompts and behaviors.

**Solution: Hybrid detection combining OS-level process state with output analysis.**

#### Why Process State Inspection Works

The operating system knows when a process is waiting for input. On Linux, we can check `/proc/{pid}/stat` and `/proc/{pid}/wchan` to determine if a process is blocked on a read syscall.

```typescript
// src/wrapper/idle-detector.ts

import fs from 'node:fs';

interface IdleSignal {
  source: 'process_state' | 'output_silence' | 'natural_ending';
  confidence: number; // 0-1
  timestamp: number;
}

interface IdleResult {
  isIdle: boolean;
  confidence: number;
  signals: IdleSignal[];
}

export class UniversalIdleDetector {
  private lastOutputTime = 0;
  private outputBuffer = '';
  private pid: number | null = null;

  constructor(pid?: number) {
    this.pid = pid ?? null;
  }

  setPid(pid: number): void {
    this.pid = pid;
  }

  onOutput(chunk: string): void {
    this.lastOutputTime = Date.now();
    this.outputBuffer += chunk;
    // Keep buffer bounded
    if (this.outputBuffer.length > 10000) {
      this.outputBuffer = this.outputBuffer.slice(-5000);
    }
  }

  /**
   * Check if the agent process is blocked on read (waiting for input).
   * This is the most reliable signal - the OS knows when a process is waiting.
   * Linux-only; returns null on other platforms.
   */
  private isProcessWaitingForInput(): boolean | null {
    if (process.platform !== 'linux' || !this.pid) {
      return null; // Can't determine on non-Linux
    }

    try {
      // Check process state from /proc/{pid}/stat
      // State codes: R=running, S=sleeping, D=disk sleep, Z=zombie, T=stopped
      const statPath = `/proc/${this.pid}/stat`;
      const stat = fs.readFileSync(statPath, 'utf-8');
      const fields = stat.split(' ');
      const state = fields[2]; // Third field is state

      // S (sleeping) often means waiting for I/O
      if (state !== 'S') {
        return false; // Running or other state = not waiting
      }

      // More precise: check what the process is blocked on
      const wchanPath = `/proc/${this.pid}/wchan`;
      const wchan = fs.readFileSync(wchanPath, 'utf-8').trim();

      // Common wait channels for terminal input
      const inputWaitChannels = [
        'wait_woken',
        'poll_schedule_timeout',
        'do_select',
        'n_tty_read',
        'unix_stream_read_generic',
        'pipe_read',
      ];

      return inputWaitChannels.some(ch => wchan.includes(ch));
    } catch {
      return null; // Process may have exited or permission denied
    }
  }

  /**
   * Check if output stream has been silent for a threshold period.
   */
  private getOutputSilenceMs(): number {
    return Date.now() - this.lastOutputTime;
  }

  /**
   * Check if the last output ends "naturally" (complete thought vs mid-sentence).
   */
  private hasNaturalEnding(): boolean {
    const lastChars = this.outputBuffer.slice(-50).trim();

    // Positive signals: output ended cleanly
    const naturalEndings = [
      /[.!?]\s*$/,           // Sentence ended
      /```\s*$/,             // Code block closed
      /\n\n$/,               // Paragraph break
      />\s*$/,               // Prompt character
      /\$\s*$/,              // Shell prompt
      />>>\s*$/,             // Python/Aider prompt
    ];

    // Negative signals: output mid-thought
    const midThought = [
      /[,;:]\s*$/,           // Comma, semicolon = more coming
      /\w$/,                 // Ended mid-word
      /[-–—]\s*$/,           // Dash = continuation
      /\(\s*$/,              // Open paren
      /\[\s*$/,              // Open bracket
      /\{\s*$/,              // Open brace
    ];

    for (const pattern of midThought) {
      if (pattern.test(lastChars)) {
        return false;
      }
    }

    for (const pattern of naturalEndings) {
      if (pattern.test(lastChars)) {
        return true;
      }
    }

    return true; // Default: assume natural if no negative signals
  }

  /**
   * Determine if the agent is idle and ready for input.
   * Combines multiple signals for reliability across all CLI types.
   */
  async checkIdle(options: { minSilenceMs?: number } = {}): Promise<IdleResult> {
    const minSilence = options.minSilenceMs ?? 500;
    const signals: IdleSignal[] = [];

    // Signal 1: Process state (most reliable on Linux)
    const processWaiting = this.isProcessWaitingForInput();
    if (processWaiting === true) {
      signals.push({
        source: 'process_state',
        confidence: 0.95, // Very high - OS-level truth
        timestamp: Date.now(),
      });
    } else if (processWaiting === false) {
      // Process is actively running - definitely not idle
      return {
        isIdle: false,
        confidence: 0.95,
        signals: [{
          source: 'process_state',
          confidence: 0.95,
          timestamp: Date.now(),
        }],
      };
    }
    // processWaiting === null means we can't determine (non-Linux)

    // Signal 2: Output silence
    const silenceMs = this.getOutputSilenceMs();
    if (silenceMs > minSilence) {
      // Confidence scales with silence duration (up to 0.8)
      const silenceConfidence = Math.min(silenceMs / 3000, 0.8);
      signals.push({
        source: 'output_silence',
        confidence: silenceConfidence,
        timestamp: Date.now(),
      });
    }

    // Signal 3: Natural ending
    if (silenceMs > 200 && this.hasNaturalEnding()) {
      signals.push({
        source: 'natural_ending',
        confidence: 0.6,
        timestamp: Date.now(),
      });
    }

    // No signals = not idle
    if (signals.length === 0) {
      return { isIdle: false, confidence: 0, signals: [] };
    }

    // Combine signals
    // Use max confidence, boosted if multiple signals agree
    const maxConfidence = Math.max(...signals.map(s => s.confidence));
    const boost = signals.length > 1 ? 0.1 : 0;
    const combinedConfidence = Math.min(maxConfidence + boost, 1.0);

    return {
      isIdle: combinedConfidence > 0.7,
      confidence: combinedConfidence,
      signals,
    };
  }

  /**
   * Wait for idle state with timeout.
   */
  async waitForIdle(timeoutMs = 30000, pollMs = 200): Promise<IdleResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.checkIdle();
      if (result.isIdle) {
        return result;
      }
      await new Promise(r => setTimeout(r, pollMs));
    }

    // Timeout - return current state
    return this.checkIdle();
  }

  /**
   * Reset state (call when agent starts new response).
   */
  reset(): void {
    this.outputBuffer = '';
    this.lastOutputTime = Date.now();
  }
}
```

#### Cross-Platform Fallback

On non-Linux platforms (macOS, Windows), we fall back to output analysis:

```typescript
// Platform-specific helpers

export function getPlatformIdleDetector(pid?: number): UniversalIdleDetector {
  const detector = new UniversalIdleDetector(pid);

  if (process.platform === 'darwin') {
    // macOS: Could use `ps` or `lsof` but slower
    // For now, rely on output analysis (signals 2 & 3)
    console.warn('[idle-detector] macOS: using output analysis only (less reliable)');
  } else if (process.platform === 'win32') {
    // Windows: Could use WMI or Performance Counters
    // For now, rely on output analysis
    console.warn('[idle-detector] Windows: using output analysis only (less reliable)');
  }

  return detector;
}
```

#### Integration with Wrapper

```typescript
// In TmuxWrapper or PtyWrapper

class TmuxWrapper {
  private idleDetector: UniversalIdleDetector;

  async start(): Promise<void> {
    // ... existing startup code ...

    // Initialize idle detector with child PID
    const pid = await this.getChildPid();
    this.idleDetector = new UniversalIdleDetector(pid);

    // Feed output to detector
    this.on('output', (chunk) => {
      this.idleDetector.onOutput(chunk);
    });
  }

  /**
   * Wait for agent to be ready for input before injecting.
   */
  async waitForAgentReady(timeoutMs = 30000): Promise<boolean> {
    const result = await this.idleDetector.waitForIdle(timeoutMs);

    if (result.isIdle) {
      this.logStderr(`Agent ready (confidence: ${(result.confidence * 100).toFixed(0)}%, signals: ${result.signals.map(s => s.source).join(', ')})`);
      return true;
    }

    this.logStderr('Agent readiness timeout - proceeding anyway');
    return false;
  }
}
```

### Stage 2: Priority Queue with Escalation

Startup context should have priority and escalating retry strategy:

```typescript
interface QueuedMessage {
  from: string;
  body: string;
  messageId: string;
  priority: 'startup' | 'normal' | 'low';
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  escalationStrategy: EscalationStrategy;
}

type EscalationStrategy =
  | { type: 'retry'; backoffMs: number[] }
  | { type: 'file_fallback'; path: string }
  | { type: 'notification'; message: string };

// Startup context gets special handling
const startupMessage: QueuedMessage = {
  from: 'system',
  body: context.formatted,
  messageId: `continuity-startup-${Date.now()}`,
  priority: 'startup',
  attempts: 0,
  maxAttempts: 5,
  createdAt: Date.now(),
  escalationStrategy: {
    type: 'retry',
    backoffMs: [1000, 2000, 5000, 10000, 30000],
  },
};
```

### Stage 3: Acknowledgment Loop

Request explicit acknowledgment from agent:

```typescript
async injectWithAcknowledgment(message: QueuedMessage): Promise<boolean> {
  // Inject with ACK request wrapper
  const wrappedContent = `
[CONTEXT INJECTION - Please acknowledge receipt]
${message.body}

[END CONTEXT - Reply "ACK: context received" to confirm]
`.trim();

  await this.inject(wrappedContent);

  // Watch for acknowledgment pattern
  const ackReceived = await this.waitForPattern(
    /ACK:\s*context received/i,
    5000 // 5s timeout
  );

  if (ackReceived) {
    this.logStderr('Context acknowledged by agent');
    return true;
  }

  // No ACK - agent may have ignored it
  this.logStderr('No acknowledgment received');
  return false;
}
```

### Stage 4: File-Based Fallback

If live injection fails repeatedly, write to CLAUDE.md:

```typescript
async escalateToFile(message: QueuedMessage): Promise<void> {
  const claudeMdPath = path.join(this.workingDirectory, 'CLAUDE.md');

  // Read existing CLAUDE.md
  let content = '';
  try {
    content = await fs.readFile(claudeMdPath, 'utf-8');
  } catch {
    content = '# Project Instructions\n\n';
  }

  // Check if we already have an injection section
  const injectionMarker = '<!-- STARTUP_CONTEXT_INJECTION -->';
  if (content.includes(injectionMarker)) {
    // Replace existing injection
    content = content.replace(
      /<!-- STARTUP_CONTEXT_INJECTION -->[\s\S]*<!-- END_STARTUP_CONTEXT -->/,
      ''
    );
  }

  // Append new injection
  const injection = `
${injectionMarker}
## Session Context (Auto-Injected)

${message.body}

<!-- END_STARTUP_CONTEXT -->
`;

  await fs.writeFile(claudeMdPath, content + '\n' + injection);

  // Notify agent to re-read CLAUDE.md
  await this.inject('[System] Session context written to CLAUDE.md - please review');
}
```

### Stage 5: Notification Fallback

If all else fails, at least tell the agent context is available:

```typescript
async notifyContextAvailable(): Promise<void> {
  const notification = `
[IMPORTANT] Session context from previous work is available.
Run: ->continuity:load
Or check CLAUDE.md for details.
`.trim();

  await this.inject(notification);
}
```

## Implementation: Revised Injection Flow

```typescript
class ContextInjector {
  private readinessDetector: AgentReadinessDetector;
  private messageQueue: PriorityQueue<QueuedMessage>;

  async injectStartupContext(context: StartupContext): Promise<void> {
    // Stage 1: Wait for readiness
    await this.waitForReadiness();

    // Stage 2: Queue with priority
    const message = this.createStartupMessage(context);
    this.messageQueue.enqueue(message);

    // Stage 3: Attempt injection with ACK
    const success = await this.tryInjectWithRetry(message);

    if (!success) {
      // Stage 4: Escalate to file
      await this.escalateToFile(message);
    }
  }

  private async waitForReadiness(): Promise<void> {
    // Wait for agent to be ready, with timeout
    const readySignal = await this.readinessDetector.waitForSignal(30000);

    if (!readySignal) {
      this.logStderr('Readiness timeout - proceeding anyway');
    } else {
      this.logStderr(`Agent ready: ${readySignal.type}`);
      // Small delay after readiness for stability
      await sleep(500);
    }
  }

  private async tryInjectWithRetry(message: QueuedMessage): Promise<boolean> {
    const backoffs = [1000, 2000, 5000, 10000];

    for (let attempt = 0; attempt < backoffs.length; attempt++) {
      message.attempts = attempt + 1;

      // Wait for injection opportunity
      const canInject = await this.waitForInjectionWindow(5000);
      if (!canInject) {
        this.logStderr(`Attempt ${attempt + 1}: No injection window`);
        await sleep(backoffs[attempt]);
        continue;
      }

      // Try injection with acknowledgment
      const acked = await this.injectWithAcknowledgment(message);
      if (acked) {
        return true;
      }

      this.logStderr(`Attempt ${attempt + 1}: No acknowledgment`);
      await sleep(backoffs[attempt]);
    }

    return false;
  }
}
```

## Configuration Options

```typescript
interface ContextInjectionConfig {
  /** Max time to wait for agent readiness (ms) */
  readinessTimeoutMs: number;  // default: 30000

  /** Require explicit acknowledgment */
  requireAcknowledgment: boolean;  // default: true

  /** Retry backoff schedule (ms) */
  retryBackoffs: number[];  // default: [1000, 2000, 5000, 10000]

  /** Fall back to CLAUDE.md after N failures */
  fileFallbackAfterAttempts: number;  // default: 3

  /** Send notification if all injections fail */
  sendNotificationOnFailure: boolean;  // default: true

  /** Patterns indicating agent is ready for input */
  readinessPatterns: RegExp[];

  /** Patterns indicating agent acknowledged */
  acknowledgmentPatterns: RegExp[];
}
```

## Metrics & Observability

Track injection success rates:

```typescript
interface InjectionMetrics {
  attempted: number;
  succeededOnFirstTry: number;
  succeededAfterRetry: number;
  escalatedToFile: number;
  failed: number;
  averageAttemptsToSuccess: number;
  averageTimeToSuccess: number;
}

// Emit metrics for dashboard
this.emit('injection:attempted', { messageId, attempt, type: 'startup' });
this.emit('injection:succeeded', { messageId, attempts, durationMs });
this.emit('injection:escalated', { messageId, escalationType: 'file' });
this.emit('injection:failed', { messageId, attempts, reason });
```

## Migration Path

### Phase 1: Add Readiness Detection (Non-Breaking)
- Add `AgentReadinessDetector` alongside existing logic
- Log when readiness detected vs 3s timeout
- Gather data on timing

### Phase 2: Add Retry with Backoff
- Replace single injection attempt with retry loop
- Add metrics tracking
- Still fall through to existing queue behavior

### Phase 3: Add Acknowledgment (Opt-In)
- New config flag `requireAcknowledgment`
- Default false for backward compatibility
- Test with specific agents

### Phase 4: Add File Fallback
- Implement CLAUDE.md injection
- Enable when acknowledgment fails
- Add cleanup on next successful injection

### Phase 5: Deprecate Old Path
- Remove arbitrary 3s delay
- Remove idle-only injection
- Full reliance on new system

## Testing Strategy

```typescript
describe('ContextInjector', () => {
  it('injects after readiness signal', async () => {
    const injector = new ContextInjector(config);
    const agent = new MockAgent();

    // Simulate agent startup
    agent.emit('output', 'Loading...\n');
    await sleep(100);
    agent.emit('output', 'Ready. How can I help?\n');

    // Should detect readiness and inject
    await injector.injectStartupContext(mockContext);

    expect(agent.receivedMessages).toContain(mockContext.formatted);
  });

  it('retries on busy agent', async () => {
    const injector = new ContextInjector(config);
    const agent = new MockAgent({ alwaysBusy: true });

    // Set to become ready after 3 attempts
    setTimeout(() => agent.setIdle(), 3000);

    await injector.injectStartupContext(mockContext);

    expect(injector.metrics.attempts).toBeGreaterThan(1);
    expect(agent.receivedMessages).toContain(mockContext.formatted);
  });

  it('falls back to file after max attempts', async () => {
    const injector = new ContextInjector({
      ...config,
      fileFallbackAfterAttempts: 2,
    });
    const agent = new MockAgent({ alwaysBusy: true });

    await injector.injectStartupContext(mockContext);

    // Should have written to CLAUDE.md
    const claudeMd = await fs.readFile('CLAUDE.md', 'utf-8');
    expect(claudeMd).toContain('Session Context');
  });
});
```

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| First-attempt success | ~30% | >70% |
| Overall success (with retry) | ~50% | >95% |
| Agent acknowledged context | 0% | >80% |
| Context visible to agent | ~50% | >99% |

## Open Questions

1. **Should acknowledgment be required?**
   - Pro: Guarantees agent saw it
   - Con: Adds noise to agent output

2. **How to handle multi-message context?**
   - Split into chunks?
   - Single large injection?

3. **Should file fallback be permanent or temporary?**
   - Clean up on next successful injection?
   - Keep for debugging?

4. **What if agent refuses to acknowledge?**
   - Some agents may not follow the pattern
   - Need graceful degradation

## Appendix: Agent-Specific Quirks

| Agent | Readiness Signal | ACK Pattern | Notes |
|-------|------------------|-------------|-------|
| Claude | `>` prompt | Follows instructions | Most reliable |
| Codex | `$` shell prompt | May need different format | Shell-focused |
| Gemini | Varies | Unpredictable | Most challenging |
| Aider | `>>>` prompt | Code-focused | May ignore prose |

# tmux Implementation: Analysis & Improvements

## Current Implementation Summary

Our tmux wrapper uses an **attach-based polling architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│  User Terminal                                               │
│    └─ tmux attach-session (stdio: 'inherit')                │
│         └─ User sees real tmux session                      │
│                                                              │
│  Background (every 200ms)                                    │
│    └─ tmux capture-pane -p -J -S -                          │
│         └─ Parse for @relay: patterns                       │
│         └─ Send detected commands to daemon                 │
│                                                              │
│  Message Injection                                           │
│    └─ Wait for 1.5s idle                                    │
│    └─ tmux send-keys (Escape, C-u, message, Enter)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Alternative Approach: WebSocket + node-pty

A different approach uses **real-time PTY streaming** instead of polling:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser/Client                                              │
│    └─ xterm.js terminal                                     │
│         └─ WebSocket connection                             │
│                                                              │
│  Server                                                      │
│    └─ node-pty spawns: tmux attach -t session               │
│         └─ pty.onData → ws.send (real-time streaming)       │
│         └─ ws.onMessage → pty.write (real-time input)       │
│                                                              │
│  No polling needed - events are instant                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Differences

| Aspect | Our Approach (Polling) | Alternative (Streaming) |
|--------|------------------------|-------------------------|
| **Terminal location** | User's actual terminal | Browser (xterm.js) |
| **Data flow** | Periodic capture-pane | Real-time PTY events |
| **Latency** | 0-200ms | ~1-10ms |
| **CPU usage** | Constant (polling) | Event-driven (lower) |
| **Complexity** | Simple shell commands | node-pty + WebSocket |
| **Dependencies** | None (just tmux) | node-pty, ws, xterm.js |
| **User experience** | Native terminal feel | Browser-based |

---

## What We Do Better

### 1. Native Terminal Experience

Users stay in their actual terminal. No browser, no xterm.js emulation quirks.

```bash
# Our approach - user is IN the tmux
agent-relay -n Alice claude
# User types directly, sees real output

# Alternative - user is in browser
# Terminal is rendered in xterm.js WebGL
# Subtle differences in keybindings, scrolling, copy/paste
```

**Keep this.** The native feel is valuable.

### 2. Simpler Dependencies

We only need tmux and Node.js. No native compilation (node-pty), no browser components.

```json
// Our package.json - no native deps
{
  "dependencies": {
    "commander": "^12.0.0",
    "better-sqlite3": "^9.0.0"
    // That's it for core functionality
  }
}

// Alternative needs
{
  "dependencies": {
    "node-pty": "^1.0.0",      // Native compilation required
    "xterm": "^5.0.0",          // Browser terminal
    "xterm-addon-fit": "...",
    "xterm-addon-webgl": "...",
    "ws": "^8.0.0"
  }
}
```

**Keep this.** Simpler install, fewer build issues.

### 3. Pattern-Based Communication

Agents just output `@relay:Name message`. No API calls, no special handling.

```
# Our approach - agent outputs text naturally
Claude: I'll ask Bob for help.
@relay:Bob Can you review the auth module?

# Alternative - agent calls external script
Claude: I'll ask Bob for help.
!send-message Bob "Can you review the auth module?"
```

**Keep this.** It's our killer feature.

---

## What We Can Improve

### 1. Activity Tracking

The alternative tracks session activity state (active/idle/disconnected) with timestamps:

```typescript
// Their approach
const sessionActivity: Map<string, number> = new Map();

// On any output
sessionActivity.set(sessionName, Date.now());

// Idle detection
const IDLE_THRESHOLD = 30_000; // 30 seconds
function getSessionStatus(name: string): 'active' | 'idle' | 'disconnected' {
  const lastActivity = sessionActivity.get(name);
  if (!lastActivity) return 'disconnected';
  return Date.now() - lastActivity > IDLE_THRESHOLD ? 'idle' : 'active';
}
```

**Improvement:** Add activity tracking for better injection timing:

```typescript
// In tmux-wrapper.ts
private lastActivityTime = Date.now();
private activityState: 'active' | 'idle' = 'active';

private updateActivityState(): void {
  const now = Date.now();
  const wasActive = this.activityState === 'active';

  if (now - this.lastActivityTime > 30_000) {
    this.activityState = 'idle';
    if (wasActive) {
      this.logStderr('Session went idle');
      // Good time to check for messages
      this.checkForInjectionOpportunity();
    }
  }
}
```

### 2. Graceful Reconnection

The alternative implements exponential backoff for WebSocket reconnection:

```typescript
// Their approach
const RECONNECT_DELAYS = [100, 500, 1000, 2000, 5000];
let reconnectAttempt = 0;

function reconnect() {
  if (reconnectAttempt >= RECONNECT_DELAYS.length) {
    console.error('Max reconnection attempts reached');
    return;
  }

  setTimeout(() => {
    connect();
    reconnectAttempt++;
  }, RECONNECT_DELAYS[reconnectAttempt]);
}
```

**Improvement:** Add to our RelayClient:

```typescript
// In client.ts
private reconnectAttempts = 0;
private readonly MAX_RECONNECT_ATTEMPTS = 5;
private readonly RECONNECT_DELAYS = [100, 500, 1000, 2000, 5000];

private scheduleReconnect(): void {
  if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
    this.logStderr('Relay connection failed, operating offline');
    return;
  }

  const delay = this.RECONNECT_DELAYS[this.reconnectAttempts];
  this.reconnectAttempts++;

  setTimeout(() => {
    this.connect().catch(() => this.scheduleReconnect());
  }, delay);
}
```

### 3. Agent Registry Persistence

The alternative stores agent metadata in a persistent registry:

```typescript
// Their approach - ~/.aimaestro/agents/registry.json
{
  "agents": {
    "agent-abc123": {
      "id": "agent-abc123",
      "name": "Alice",
      "aliases": ["alice", "dev-alice"],
      "workingDirectory": "/home/user/project",
      "cli": "claude",
      "createdAt": "2025-12-20T10:00:00Z",
      "lastSeen": "2025-12-20T14:30:00Z"
    }
  }
}
```

**Improvement:** Add agent registry:

```typescript
// New file: src/daemon/registry.ts
interface AgentRecord {
  id: string;
  name: string;
  cli: string;
  workingDirectory: string;
  firstSeen: string;
  lastSeen: string;
  messagesSent: number;
  messagesReceived: number;
}

class AgentRegistry {
  private registryPath: string;
  private agents: Map<string, AgentRecord> = new Map();

  constructor(dataDir: string) {
    this.registryPath = path.join(dataDir, 'agents.json');
    this.load();
  }

  register(name: string, cli: string, cwd: string): AgentRecord {
    const existing = this.agents.get(name);
    if (existing) {
      existing.lastSeen = new Date().toISOString();
      this.save();
      return existing;
    }

    const record: AgentRecord = {
      id: `agent-${randomId()}`,
      name,
      cli,
      workingDirectory: cwd,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      messagesSent: 0,
      messagesReceived: 0,
    };

    this.agents.set(name, record);
    this.save();
    return record;
  }
}
```

### 4. Session Discovery

The alternative auto-discovers tmux sessions:

```typescript
// Their approach
async function discoverLocalSessions(): Promise<Session[]> {
  const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
  const sessionNames = stdout.trim().split('\n').filter(Boolean);

  return Promise.all(sessionNames.map(async (name) => {
    const { stdout: cwd } = await execAsync(
      `tmux display-message -t ${name} -p '#{pane_current_path}'`
    );
    return { name, workingDirectory: cwd.trim() };
  }));
}
```

**Improvement:** Add discovery for better `agent-relay status`:

```typescript
// In cli/index.ts - enhance status command
async function discoverRelaySessions(): Promise<SessionInfo[]> {
  try {
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
    const sessions = stdout.trim().split('\n').filter(Boolean);

    // Filter to relay sessions only
    return sessions
      .filter(name => name.startsWith('relay-'))
      .map(name => {
        const match = name.match(/^relay-(.+)-\d+$/);
        return match ? { sessionName: name, agentName: match[1] } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
```

### 5. Output Filtering

The alternative filters noisy patterns from logs:

```typescript
// Their approach - filter thinking indicators, escape sequences
const NOISE_PATTERNS = [
  /\[\d+\/\d+\]/,           // [1/418] thinking steps
  /\x1b\[[0-9;]*[mK]/,      // ANSI escape sequences
  /^Thinking\.{1,3}$/,       // "Thinking..." lines
];

function filterNoise(output: string): string {
  return output.split('\n')
    .filter(line => !NOISE_PATTERNS.some(p => p.test(line)))
    .join('\n');
}
```

**Improvement:** Add optional output filtering for cleaner logs:

```typescript
// In tmux-wrapper.ts
private filterForLogging(output: string): string {
  if (!this.config.filterLogs) return output;

  return output
    .split('\n')
    .filter(line => {
      // Skip thinking indicators
      if (/^\[[\d/]+\]/.test(line)) return false;
      // Skip empty ANSI-only lines
      if (this.stripAnsi(line).trim() === '') return false;
      return true;
    })
    .join('\n');
}
```

---

## Rejected Ideas

### 1. Browser-Based Terminal

Moving to xterm.js would lose the native terminal feel. Users expect to use their own terminal with their own keybindings, themes, and muscle memory.

**Decision:** Keep native tmux attach.

### 2. Full node-pty Integration

Using node-pty for output streaming would add native dependencies and build complexity. The polling approach works well enough.

**Decision:** Keep capture-pane polling. Consider optional streaming as future enhancement.

### 3. Complex Agent Lifecycle

The alternative supports agents without sessions, complex metadata, and persistent memory. This adds significant complexity.

**Decision:** Keep it simple. Agent = wrapper process. When wrapper exits, agent is gone.

---

## Implementation Priority

| Improvement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| Activity tracking | Low | Medium | P1 |
| Reconnection backoff | Low | Medium | P1 |
| Session discovery | Low | Low | P2 |
| Agent registry | Medium | Medium | P2 |
| Output filtering | Low | Low | P3 |

---

## Summary

Our tmux implementation is **simpler and more native** than alternatives. The key improvements to adopt:

1. **Activity state tracking** - Better injection timing
2. **Exponential backoff** - Graceful daemon reconnection
3. **Session discovery** - Better status output
4. **Agent registry** - Persistence across restarts

These add minimal complexity while improving reliability. The core architecture (polling + pattern parsing + injection) remains unchanged.

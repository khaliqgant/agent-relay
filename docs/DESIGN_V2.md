# Agent-Relay v2 Design Document

## Overview

This document outlines improvements to agent-relay while preserving its core philosophy: **simple, transparent agent-to-agent communication via terminal output patterns**.

The `@relay:` pattern is the killer feature. Agents communicate naturally by just printing text. No APIs, no SDKs, no special integrations. This must remain the foundation.

---

## Current Pain Points

### 1. Ephemeral Storage (`/tmp`)
- Data lives in `/tmp/agent-relay/<hash>/`
- Cleared on reboot (macOS/Linux)
- Message history lost unexpectedly

### 2. Dead Code
- ACK/NACK protocol defined but not implemented
- Session resume tokens always return `RESUME_TOO_OLD`
- PostgreSQL adapter throws "not implemented"

### 3. Memory Leaks
- `sentMessageHashes` Set grows unbounded
- Long-running sessions will OOM

### 4. Polling Overhead
- `capture-pane` every 200ms consumes CPU
- Latency up to 200ms for message detection

### 5. Fragile Injection Timing
- 1.5s idle detection is a heuristic
- Race conditions if agent outputs during injection

---

## Design Principles

1. **Keep it simple** - Every feature must justify its complexity
2. **Terminal-native** - Users stay in tmux, not a browser
3. **Pattern-based** - `@relay:` is the API
4. **Zero config** - Works out of the box
5. **Debuggable** - Easy to understand what's happening

---

## Proposed Changes

### Phase 1: Foundation Fixes

#### 1.1 Persistent Storage Location

Move from `/tmp` to XDG-compliant location:

```
~/.local/share/agent-relay/          # XDG_DATA_HOME fallback
├── projects/
│   └── <project-hash>/
│       ├── relay.sock               # Unix socket
│       ├── messages.db              # SQLite
│       └── agents.json              # Connected agents
└── config.json                      # Global settings (optional)
```

**Migration path:**
- Check for existing `/tmp/agent-relay/` data on startup
- Offer one-time migration prompt
- Fall back to new location for fresh installs

#### 1.2 Remove Dead Code

Delete these unimplemented features:

| Feature | Location | Action |
|---------|----------|--------|
| ACK handling | `connection.ts:114-116` | Remove |
| Resume tokens | `connection.ts:140-143` | Remove |
| PostgreSQL adapter | `storage/adapter.ts:152-162` | Remove |
| Topic subscriptions | `router.ts` | Keep but mark experimental |

**Protocol simplification:**
```typescript
// Before: 10 message types
type MessageType = 'HELLO' | 'WELCOME' | 'SEND' | 'DELIVER' | 'ACK' |
                   'PING' | 'PONG' | 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'ERROR' | 'BYE';

// After: 6 message types
type MessageType = 'HELLO' | 'WELCOME' | 'SEND' | 'DELIVER' |
                   'PING' | 'PONG' | 'ERROR';
```

#### 1.3 Fix Memory Leak

Replace unbounded Set with LRU cache:

```typescript
// Before
private sentMessageHashes: Set<string> = new Set();

// After
import { LRUCache } from 'lru-cache';

private sentMessageHashes = new LRUCache<string, boolean>({
  max: 10000,           // Max 10k unique messages tracked
  ttl: 1000 * 60 * 60,  // Expire after 1 hour
});
```

#### 1.4 Simplify Binary Protocol

Replace 4-byte length prefix with newline-delimited JSON:

```typescript
// Before: Binary framing
[4-byte length][JSON payload]

// After: NDJSON (newline-delimited JSON)
{"v":1,"type":"SEND","to":"Bob","payload":{"body":"Hello"}}\n
{"v":1,"type":"DELIVER","from":"Alice","payload":{"body":"Hello"}}\n
```

**Benefits:**
- Human-readable when debugging (`nc -U relay.sock`)
- Simpler parser (~20 lines vs ~50 lines)
- Standard format (NDJSON)

**Trade-off:** Messages cannot contain literal newlines in body. Since we already sanitize newlines for injection (`replace(/[\r\n]+/g, ' ')`), this is acceptable.

---

### Phase 2: Reliability Improvements

#### 2.1 Improved Injection Strategy

Replace time-based idle detection with input buffer detection:

```typescript
// Current: Wait 1.5s after last output (fragile)
if (Date.now() - lastOutputTime > 1500) {
  inject();
}

// Proposed: Check if input line is empty
async function isInputClear(): Promise<boolean> {
  // Capture current pane content
  const { stdout } = await execAsync(
    `tmux capture-pane -t ${session} -p -J`
  );
  const lines = stdout.split('\n');
  const lastLine = lines[lines.length - 1] || '';

  // Check if last line is just a prompt (no partial input)
  return /^[>$%#➜]\s*$/.test(lastLine);
}
```

#### 2.2 Bracketed Paste Mode

Use bracketed paste for safer injection:

```typescript
// Wrap injection in bracketed paste markers
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

async function injectSafe(text: string): Promise<void> {
  await sendKeysLiteral(PASTE_START + text + PASTE_END);
  await sendKeys('Enter');
}
```

**Benefits:**
- Prevents shell interpretation of special characters
- Atomic paste (no interleaving)
- Supported by most modern terminals/shells

#### 2.3 Message Queue for Offline Agents

Queue messages when target agent is disconnected:

```typescript
interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  payload: SendPayload;
  queuedAt: number;
  attempts: number;
}

// In router.ts
if (!targetConnection || targetConnection.state !== 'ACTIVE') {
  this.messageQueue.enqueue({
    id: envelope.id,
    from: connection.agentName,
    to: envelope.to,
    payload: envelope.payload,
    queuedAt: Date.now(),
    attempts: 0,
  });

  // Notify sender
  connection.send({
    type: 'QUEUED',
    id: envelope.id,
    reason: 'recipient_offline',
  });
}

// On agent connect, flush queued messages
onAgentConnect(agentName: string) {
  const queued = this.messageQueue.getForRecipient(agentName);
  for (const msg of queued) {
    this.deliverMessage(msg);
    this.messageQueue.remove(msg.id);
  }
}
```

---

### Phase 3: Developer Experience

#### 3.1 Structured Logging

Replace scattered `console.log` with leveled logging:

```typescript
import { createLogger } from './logger.js';

const log = createLogger('daemon');

log.info('Agent registered', { name: 'Alice', cli: 'claude' });
log.debug('Message routed', { from: 'Alice', to: 'Bob', id: '...' });
log.error('Connection failed', { error: err.message });
```

Output format (when `DEBUG=agent-relay`):
```
[14:23:01.234] INFO  daemon: Agent registered name=Alice cli=claude
[14:23:01.456] DEBUG router: Message routed from=Alice to=Bob id=abc123
```

#### 3.2 Health Check Endpoint

Add simple HTTP health check (optional, disabled by default):

```typescript
// Enable with: agent-relay up --health-port 3889
// Or: AGENT_RELAY_HEALTH_PORT=3889

GET http://localhost:3889/health
{
  "status": "ok",
  "uptime": 3600,
  "agents": ["Alice", "Bob"],
  "messages": {
    "sent": 42,
    "delivered": 41,
    "queued": 1
  }
}
```

#### 3.3 CLI Improvements

```bash
# Current
agent-relay up
agent-relay -n Alice claude
agent-relay status
agent-relay read <id>

# Add
agent-relay agents              # List connected agents
agent-relay send Alice "Hello"  # Send from CLI (for testing)
agent-relay logs                # Tail daemon logs
agent-relay logs Alice          # Tail agent's relay activity
```

---

### Phase 4: Optional Enhancements

#### 4.1 WebSocket Streaming (Optional)

Replace polling with WebSocket-based output streaming:

```typescript
// Instead of polling capture-pane, attach via PTY
import { spawn } from 'node-pty';

const pty = spawn('tmux', ['attach-session', '-t', session, '-r'], {
  // Read-only attach
});

pty.onData((data) => {
  // Real-time output, no polling
  const { commands } = parser.parse(data);
  for (const cmd of commands) {
    sendRelayCommand(cmd);
  }
});
```

**Trade-offs:**
| Aspect | Polling | WebSocket/PTY |
|--------|---------|---------------|
| Latency | 0-200ms | ~1-10ms |
| CPU | Higher | Lower |
| Complexity | Simple | More complex |
| Dependencies | None | node-pty |

**Recommendation:** Keep polling as default, offer streaming as `--experimental-streaming` flag.

#### 4.2 Message Encryption (Optional)

For sensitive inter-agent communication:

```typescript
// Generate per-project key on first run
const projectKey = await generateKey();
fs.writeFileSync(keyPath, projectKey, { mode: 0o600 });

// Encrypt message bodies
const encrypted = await encrypt(payload.body, projectKey);
```

**Scope:** Only encrypt message body, not metadata (to/from/timestamp).

---

## Migration Plan

### v1.x → v2.0

1. **Storage migration**
   - Detect existing `/tmp/agent-relay/` data
   - Copy to `~/.local/share/agent-relay/`
   - Remove old location after successful migration

2. **Protocol compatibility**
   - v2 daemon accepts both binary and NDJSON
   - v2 clients send NDJSON only
   - Deprecation warning for binary clients

3. **Breaking changes**
   - Remove ACK/resume/PostgreSQL (unused)
   - Change default storage location

---

## File Structure (Post-Refactor)

```
src/
├── cli/
│   └── index.ts              # CLI entry point
├── daemon/
│   ├── server.ts             # Main daemon
│   ├── connection.ts         # Connection handling (simplified)
│   └── router.ts             # Message routing + queue
├── wrapper/
│   ├── tmux-wrapper.ts       # Agent wrapper
│   ├── parser.ts             # @relay: pattern parser
│   └── client.ts             # Relay client
├── protocol/
│   └── types.ts              # Message types (reduced)
├── storage/
│   └── sqlite-adapter.ts     # SQLite only (removed abstraction)
└── utils/
    ├── logger.ts             # Structured logging
    ├── paths.ts              # XDG-compliant paths
    └── lru-cache.ts          # For deduplication
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lines of code | ~2500 | ~2000 |
| Message types | 10 | 6 |
| Dependencies | 12 | 10 |
| Memory (1hr session) | Unbounded | <50MB |
| Message detection latency | 0-200ms | 0-200ms (or <10ms with streaming) |
| Data persistence | Lost on reboot | Permanent |

---

## Non-Goals

- **Dashboard/Web UI**: Out of scope. Use `agent-relay logs` for visibility.
- **Multi-host support**: Single machine focus. Use SSH for remote.
- **Agent memory/RAG**: Separate concern. Agents manage their own context.
- **Authentication**: Unix socket permissions are sufficient for local use.

---

## Timeline

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | Foundation fixes | 2-3 days |
| Phase 2 | Reliability | 2-3 days |
| Phase 3 | DX improvements | 1-2 days |
| Phase 4 | Optional enhancements | As needed |

---

## Open Questions

1. **NDJSON vs Binary**: Is the simplicity worth losing multi-line message support?
   - Mitigation: Encode newlines as `\n` in JSON strings (already done)

2. **Polling interval**: Should 200ms be configurable?
   - Proposal: Add `--poll-interval` flag, default 200ms

3. **Message TTL**: How long to queue messages for offline agents?
   - Proposal: 24 hours default, configurable

4. **Backward compatibility**: How long to support v1 binary protocol?
   - Proposal: One minor version (v2.1 removes it)

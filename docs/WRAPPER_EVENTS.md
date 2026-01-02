# PtyWrapper Events

PtyWrapper extends Node.js EventEmitter and emits events for monitoring agent behavior, handling persistence, and debugging. This document describes all available events and how to use them.

## Event Reference

### `output`

Emitted for every chunk of output from the agent's PTY.

```typescript
pty.on('output', (data: string) => {
  console.log('Agent output:', data);
});
```

**Parameters:**
- `data` (string): Raw output data from the PTY

**Use cases:**
- Live log streaming to dashboard
- Output capture for analysis
- Debugging agent behavior

---

### `exit`

Emitted when the agent process exits.

```typescript
pty.on('exit', (code: number) => {
  console.log(`Agent exited with code ${code}`);
});
```

**Parameters:**
- `code` (number): Exit code of the process (0 = success)

**Use cases:**
- Cleanup resources
- Trigger restart logic
- Update agent status

---

### `error`

Emitted when an error occurs in the wrapper.

```typescript
pty.on('error', (error: Error) => {
  console.error('PTY error:', error);
});
```

**Parameters:**
- `error` (Error): The error that occurred

**Use cases:**
- Error logging
- Alerting
- Graceful error handling

---

### `injection-failed`

Emitted when message injection fails after all retry attempts.

```typescript
import type { InjectionFailedEvent } from './wrapper/pty-wrapper.js';

pty.on('injection-failed', (event: InjectionFailedEvent) => {
  console.warn('Injection failed:', event);
});
```

**Parameters:**
- `event.messageId` (string): ID of the failed message
- `event.from` (string): Sender of the message
- `event.attempts` (number): Number of injection attempts made

**Use cases:**
- Alert on delivery failures
- Fallback to inbox-based delivery
- Dashboard warning indicators

---

### `summary`

Emitted when the agent outputs a `[[SUMMARY]]` block. Used for cloud persistence.

```typescript
import type { SummaryEvent } from './wrapper/pty-wrapper.js';

pty.on('summary', (event: SummaryEvent) => {
  console.log(`${event.agentName} summary:`, event.summary);
});
```

**Parameters:**
- `event.agentName` (string): Name of the agent
- `event.summary` (ParsedSummary): Parsed summary object
  - `currentTask?` (string): What the agent is currently working on
  - `completedTasks?` (string[]): List of completed tasks
  - `decisions?` (string[]): Key decisions made
  - `context?` (string): Additional context
  - `files?` (string[]): Files being worked on

**Agent output format:**
```
[[SUMMARY]]
{
  "currentTask": "Implementing auth module",
  "completedTasks": ["login flow", "session management"],
  "context": "Using JWT for tokens",
  "files": ["src/auth.ts", "src/session.ts"]
}
[[/SUMMARY]]
```

**Use cases:**
- Persist agent progress to database
- Resume interrupted sessions
- Dashboard progress indicators

---

### `session-end`

Emitted when the agent outputs a `[[SESSION_END]]` block. Marks explicit session completion.

```typescript
import type { SessionEndEvent } from './wrapper/pty-wrapper.js';

pty.on('session-end', (event: SessionEndEvent) => {
  console.log(`${event.agentName} ended session:`, event.marker);
});
```

**Parameters:**
- `event.agentName` (string): Name of the agent
- `event.marker` (SessionEndMarker): End marker object
  - `summary?` (string): Final session summary
  - `completedTasks?` (string[]): Tasks completed in session

**Agent output format:**
```
[[SESSION_END]]
{
  "summary": "Completed auth module implementation",
  "completedTasks": ["login", "logout", "session management"]
}
[[/SESSION_END]]
```

Or empty for clean close:
```
[[SESSION_END]][[/SESSION_END]]
```

**Use cases:**
- Close session in database
- Trigger cleanup
- Update billing/usage

---

## Cloud Persistence Integration

For cloud deployments, use `CloudPersistenceService` to automatically persist summary and session-end events to PostgreSQL:

```typescript
import { PtyWrapper } from './wrapper/pty-wrapper.js';
import { CloudPersistenceService } from './cloud/services/persistence.js';

// Create persistence service
const persistence = new CloudPersistenceService({
  workspaceId: 'workspace-123',
  onSummaryPersisted: (agentName, summaryId) => {
    console.log(`Summary saved: ${summaryId}`);
  },
});

// Create and start PTY
const pty = new PtyWrapper(config);
await pty.start();

// Bind persistence to PTY - creates session record
const sessionId = await persistence.bindToPtyWrapper(pty);

// ... agent runs ...

// Cleanup when done
persistence.unbindFromPtyWrapper(pty);
```

### Database Schema

```sql
-- Agent sessions
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  agent_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_marker JSONB,
  metadata JSONB DEFAULT '{}'
);

-- Agent summaries
CREATE TABLE agent_summaries (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES agent_sessions(id),
  agent_name VARCHAR(255) NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Daemon Event Integration

When using `AgentManager`, PtyWrapper events are automatically forwarded as daemon events:

| PtyWrapper Event | Daemon Event | Description |
|------------------|--------------|-------------|
| `summary` | `agent:summary` | Agent output a summary block |
| `session-end` | `agent:session-end` | Agent explicitly ended session |
| `injection-failed` | `agent:injection-failed` | Message delivery failed |

```typescript
const manager = getAgentManager();

// Optional: Enable cloud persistence
manager.setCloudPersistence({
  onSummary: async (agentId, event) => {
    await db.saveSummary(agentId, event.summary);
  },
  onSessionEnd: async (agentId, event) => {
    await db.endSession(agentId, event.marker);
  },
});

// Daemon events are emitted to connected dashboard clients
manager.on('event', (event) => {
  if (event.type === 'agent:summary') {
    broadcastToClients(event);
  }
});
```

---

## Event Flow Diagram

```
Agent Output
    │
    ▼
┌───────────────┐
│  PtyWrapper   │
│ handleOutput()│
└───────┬───────┘
        │
        ├──► emit('output', data)
        │
        ├──► parseRelayCommands()
        │
        ├──► checkForSummaryAndEmit()
        │         │
        │         ▼
        │    emit('summary', event)
        │         │
        │         ▼
        │    CloudPersistenceService
        │         │
        │         ▼
        │    PostgreSQL
        │
        └──► checkForSessionEndAndEmit()
                  │
                  ▼
             emit('session-end', event)
```

---

## Best Practices

1. **Always unbind on cleanup** - Call `persistence.unbindFromPtyWrapper(pty)` or the listeners will leak

2. **Use resetSessionState() for reuse** - If reusing a wrapper instance, call `pty.resetSessionState()` to clear session-specific state

3. **Handle async errors** - Event handlers for `summary` and `session-end` can be async, but errors should be caught

4. **Deduplication is automatic** - PtyWrapper deduplicates summary events based on content, preventing repeated persistence of the same summary

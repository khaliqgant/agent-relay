# Agent Relay Roadmap

This roadmap tracks planned improvements, bug fixes, and new features for agent-relay. Issues are tracked in [Beads](https://github.com/steveyegge/beads).

**Last Updated:** 2025-12-20

---

## Overview

| Category | Open | In Progress |
|----------|------|-------------|
| Bugs | 4 | 0 |
| Features | 7 | 1 |
| Tasks | 7 | 1 |
| **Total** | **18** | **2** |

---

## Bugs

### `agent-relay-ahe` Session resume not implemented
**Status:** Open | **Priority:** P2

Session resume tokens are received but not persisted or validated. The server always responds with `RESUME_TOO_OLD`, breaking the resume capability advertised in the protocol.

**Location:** `src/daemon/connection.ts:140-143`

**Required Work:**
- Implement token persistence
- Add session state recovery
- Validate resume tokens on reconnect

---

### `agent-relay-5af` Hook doesn't integrate with daemon-based messaging
**Status:** Open | **Priority:** P2

The inbox-check hook reads from file-based inbox but the daemon uses SQLite. When using daemon mode, the hook won't see messages.

**Location:** `src/hooks/inbox-check/hook.ts`

**Required Work:**
- Query daemon storage from hook, OR
- Ensure inbox files are written in daemon mode too

---

### `agent-relay-6rz` Message injection timing can cause race conditions
**Status:** Open | **Priority:** P2

Injection waits for 'idle' (1.5s since last output) but this is fragile. If agent produces output during injection, messages could interleave.

**Location:** `src/wrapper/tmux-wrapper.ts:564-569`

**Required Work:**
- Input buffer detection
- Bracketed paste mode support
- Agent-specific injection strategies

---

### `agent-relay-8nx` SIGINT/SIGTERM handlers don't await cleanup
**Status:** Open | **Priority:** P2

SIGINT handlers call `stop()` but `process.exit(0)` runs immediately. The `stop()` is async but not awaited, potentially leaving socket files or incomplete shutdown.

**Location:** `src/cli/index.ts:74-77`

**Required Work:**
- Await async cleanup before exit
- Ensure socket files are removed
- Add timeout for cleanup operations

---

## Features

### `agent-relay-ghy` Team config: auto-spawn agents from teams.json
**Status:** In Progress | **Priority:** P2

When a project has a `teams.json` config file, `agent-relay up` should either auto-spawn terminal sessions for each agent or validate names against the config.

**teams.json format:**
```json
{
  "team": "my-project",
  "agents": [
    {"name": "Coordinator", "cli": "claude", "role": "coordinator"},
    {"name": "LeadDev", "cli": "claude", "role": "developer"}
  ],
  "autoSpawn": false
}
```

**Commands:**
- `agent-relay up --spawn` - force spawn all agents
- `agent-relay up --no-spawn` - just start daemon, manual agent starts

---

### `agent-relay-2z1` ACK messages not used for reliability
**Status:** Open | **Priority:** P2

ACK messages are accepted but not processed. The protocol supports reliable delivery with ACK/NACK but it's not implemented.

**Location:** `src/daemon/connection.ts:114-116`

**Required Work:**
- Track unACKed messages
- Implement retry logic
- Add configurable TTL for messages

---

### `agent-relay-go9` PostgreSQL storage adapter
**Status:** Open | **Priority:** P2

PostgreSQL is listed as a storage option but throws "not yet implemented". For production multi-node deployments, SQLite won't scale.

**Location:** `src/storage/adapter.ts:152-162`

**Required Work:**
- Implement PostgreSQL adapter
- Add connection pooling
- Support distributed storage for multi-node setups

---

### `agent-relay-sio` Graceful degradation when daemon unavailable
**Status:** Open | **Priority:** P2

Daemon connection failures are silently caught with no recovery mechanism.

**Location:** `src/wrapper/tmux-wrapper.ts:195-197`

**Required Work:**
- Periodic reconnection attempts
- Queue messages for later delivery
- Visual indicator in terminal showing connection status

---

### `agent-relay-dyr` Authentication between agents
**Status:** Open | **Priority:** P2

Any process can connect to the daemon socket and impersonate any agent name. No authentication exists.

**Required Work:**
- Per-agent tokens/secrets
- Socket permission checks
- Optional TLS for non-localhost deployments

---

### `agent-relay-0bn` Dashboard real-time connection status
**Status:** Open | **Priority:** P2

Dashboard shows agent status from messages but doesn't show live connection status (connected/disconnected).

**Required Work:**
- Show online/offline indicators
- Display last-seen timestamps
- Real-time connection state from daemon

---

### `agent-relay-52d` Metrics/observability for daemon
**Status:** Open | **Priority:** P2

No way to monitor daemon health, message throughput, or agent activity.

**Required Work:**
- `/metrics` endpoint for Prometheus
- Message count/rate stats
- Connection lifecycle events
- Error rate tracking

---

### `agent-relay-8ff` Agent list command in CLI
**Status:** Open | **Priority:** P2

CLI has `up/down/status/read` but no way to list connected agents or see message history from command line.

**Required Work:**
- `agent-relay agents` - list connected agents
- `agent-relay history` - show recent messages
- `agent-relay send <agent> <msg>` - send from CLI

---

## Tasks

### `agent-relay-8z1` Add CLI tests for new command structure
**Status:** In Progress | **Priority:** P2

Add comprehensive tests for CLI commands after command consolidation.

**Blocked by:** Command consolidation tasks (closed)

---

### `agent-relay-hks` Increase test coverage
**Status:** Open | **Priority:** P2

Current coverage is only **39% overall**. Key files with 0% coverage:
- `daemon/server.ts`
- `dashboard/server.ts`
- `cli/index.ts`
- `wrapper/client.ts`
- `wrapper/tmux-wrapper.ts`
- `utils/project-namespace.ts`

**Required Work:**
- Integration tests for daemon startup/shutdown lifecycle
- CLI command tests
- End-to-end message flow tests

---

### `agent-relay-v57` Message expiration/cleanup in SQLite
**Status:** Open | **Priority:** P2

SQLite adapter has no TTL or cleanup mechanism for old messages. Database will grow unbounded over time.

**Location:** `src/storage/sqlite-adapter.ts`

**Required Work:**
- Configurable message retention period
- Automatic cleanup job
- Leverage existing `ts` column index

---

### `agent-relay-kzw` Project namespace uses /tmp
**Status:** Open | **Priority:** P2

`BASE_DIR` is `/tmp/agent-relay`. On macOS/Linux, `/tmp` is cleared on reboot, losing all message history.

**Location:** `src/utils/project-namespace.ts:13`

**Required Work:**
- XDG_DATA_HOME fallback
- `~/.agent-relay` option
- Per-project `.agent-relay` folder

---

### `agent-relay-37i` Message deduplication memory limits
**Status:** Open | **Priority:** P2

`sentMessageHashes` is a Set that grows unbounded. For long-running sessions, this could cause memory issues.

**Location:** `src/wrapper/tmux-wrapper.ts:65`

**Required Work:**
- Max size with LRU eviction
- Time-based expiration
- Bloom filter alternative for memory efficiency

---

### `agent-relay-5g0` Heartbeat timeout configuration
**Status:** Open | **Priority:** P2

Heartbeat timeout is hardcoded as 2x `heartbeatMs`. Heartbeat failures immediately kill the connection.

**Location:** `src/daemon/connection.ts:196`

**Required Work:**
- Independent timeout configuration
- Exponential backoff for transient issues

---

### `agent-relay-7bp` Memory storage adapter limits
**Status:** Open | **Priority:** P2

MemoryStorageAdapter hard-codes 1000 message limit.

**Location:** `src/storage/adapter.ts:60-63`

**Required Work:**
- Configurable limit
- LRU eviction instead of slice

---

### `agent-relay-47z` Express 5 compatibility verification
**Status:** Open | **Priority:** P2

`package.json` uses `express@5.2.1` which has breaking changes from Express 4.

**Required Work:**
- Verify error handling middleware patterns
- Check router behavior
- Validate body parsing (express.json vs body-parser)

---

## Recently Completed

### `agent-relay-ucw` Dashboard: multi-project navigation or dynamic port allocation
**Status:** Closed | **Completed:** 2025-12-20

Fixed dashboard to warn when requested port is busy and return the actual port. CLI now awaits and logs the real URL.

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| P0 | Critical - blocking users |
| P1 | High - significant impact |
| P2 | Medium - normal priority |
| P3 | Low - nice to have |

---

## Contributing

To work on an issue:
1. Run `bd ready` to see available work
2. Claim with `bd update <id> --status=in_progress`
3. Complete work and close with `bd close <id>`

See [CLAUDE.md](./CLAUDE.md) for development workflow details.

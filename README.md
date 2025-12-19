# agent-relay

Real-time messaging between AI agents.

## Install

```bash
npm install -g agent-relay
```

**Requirements:** Node.js 20+, tmux

## Quick Start

```bash
# Terminal 1: Start daemon
relay up

# Terminal 2: Start an agent
relay -n Alice claude

# Terminal 3: Start another agent
relay -n Bob codex
```

Agents communicate by outputting `@relay:` patterns:

```
@relay:Bob Hey, can you review my changes?
@relay:* Broadcasting to everyone
```

## CLI

| Command | Description |
|---------|-------------|
| `relay <cmd>` | Wrap agent with messaging |
| `relay -n Name <cmd>` | Wrap with specific name |
| `relay up` | Start daemon + dashboard |
| `relay down` | Stop daemon |
| `relay status` | Check if running |
| `relay read <id>` | Read truncated message |

## How It Works

1. `relay up` starts a daemon that routes messages via Unix socket
2. `relay <cmd>` wraps your agent in tmux, parsing output for `@relay:` patterns
3. Messages are injected into recipient terminals in real-time

```
┌─────────────┐     ┌─────────────┐
│ Agent Alice │     │  Agent Bob  │
│   (tmux)    │     │   (tmux)    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
        Unix Domain Socket
                 │
        ┌────────┴────────┐
        │  relay daemon   │
        └─────────────────┘
```

## Agent Communication

### Send Message

```
@relay:AgentName Your message here
```

### Broadcast

```
@relay:* Message to all agents
```

### Receive

Messages appear as:

```
Relay message from Alice [abc123]: Your message here
```

### Truncated Messages

Long messages are truncated. Use the ID to read full content:

```bash
relay read abc123
```

## Dashboard

`relay up` starts a web dashboard at http://localhost:3888

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Messages not sending | `relay status` to check daemon |
| Socket not found | `relay up` to start daemon |
| Truncated message | `relay read <id>` |

## Development

```bash
git clone https://github.com/khaliqgant/agent-relay.git
cd agent-relay
npm install && npm run build
```

## License

MIT

# Local Development

Run Agent Relay locally for development, testing, or standalone use without cloud features.

## Overview

Local mode is perfect for:
- Quick prototyping with multiple agents
- Development and testing
- Offline/air-gapped environments
- Learning Agent Relay before going to cloud

## Quick Start (One Command)

```bash
git clone https://github.com/khaliqgant/agent-relay.git
cd agent-relay
npm install
npm run dev:start
```

This builds everything and starts:
- Daemon (message routing)
- Dashboard (Next.js dev server with hot reload)

**URLs:**
| Page | URL |
|------|-----|
| Landing Page | http://localhost:3888 |
| Pricing | http://localhost:3888/pricing |
| Dashboard | http://localhost:3888/app |

**Commands:**
```bash
npm run dev:start    # Start everything
npm run dev:stop     # Stop everything
npm run dev:attach   # Attach to tmux session
```

## Installation

### Requirements

- **Node.js** 20+
- **tmux** installed
- **Build tools** for native modules

### Install on Linux

```bash
# Install build tools and tmux
sudo apt-get update
sudo apt-get install -y build-essential tmux
```

### Install on macOS

```bash
# Install tmux
brew install tmux

# Install build tools (if needed)
xcode-select --install
```

### Install on Windows (WSL)

Agent Relay requires WSL on Windows:

```bash
# In WSL terminal
sudo apt-get update
sudo apt-get install -y build-essential tmux
```

## Using the Published Package

If you just want to use Agent Relay (not develop it):

```bash
npm install -g agent-relay
agent-relay up
```

Dashboard at `http://localhost:3888`.

## Development Workflow

### Start Development Environment

```bash
npm run dev:start
```

This opens a tmux session with three windows:
1. **daemon** - Message routing daemon
2. **dashboard** - Next.js dev server (hot reload)
3. **agents** - Ready to spawn agents

### Attach to Session

```bash
npm run dev:attach
# or
tmux attach -t agent-relay-dev
```

Navigate windows with `Ctrl+B` then `n` (next) or `p` (previous).

### Run an Agent

In the agents window (or any terminal):

```bash
node dist/cli/index.js -n Alice claude
```

### Stop Everything

```bash
npm run dev:stop
```

## Quick Start (Manual)

If you prefer not to use tmux:

```bash
# Terminal 1: Start the daemon
agent-relay up

# Terminal 2: Start an agent
agent-relay -n Alice claude

# Terminal 3: Start another agent
agent-relay -n Bob codex
```

Dashboard at `http://localhost:3888`.

## How It Works

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
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │   Dashboard     │
        │  localhost:3888 │
        └─────────────────┘
```

1. `agent-relay up` starts a daemon that routes messages via Unix socket
2. `agent-relay <cmd>` wraps your agent in tmux, parsing output for `->relay:` patterns
3. Messages are injected into recipient terminals in real-time

## CLI Reference

### Daemon Commands

| Command | Description |
|---------|-------------|
| `agent-relay up` | Start daemon + dashboard |
| `agent-relay down` | Stop daemon |
| `agent-relay status` | Check if running |
| `agent-relay logs` | View daemon logs |

### Agent Commands

| Command | Description |
|---------|-------------|
| `agent-relay <cmd>` | Wrap agent with messaging |
| `agent-relay -n Name <cmd>` | Wrap with specific name |
| `agent-relay read <id>` | Read truncated message |

### Multi-Project Commands

| Command | Description |
|---------|-------------|
| `agent-relay bridge <projects...>` | Bridge multiple projects |

## Sending Messages

Agents communicate by outputting `->relay:` patterns. Always use the fenced format:

### Direct Message

```
->relay:Bob <<<
Hey, can you review my changes?>>>
```

### Broadcast

```
->relay:* <<<
Broadcasting to everyone>>>
```

### With Thread

```
->relay:Alice [thread:code-review] <<<
Please check the auth module>>>
```

## Receiving Messages

Messages appear in the agent's terminal as:

```
Relay message from Alice [abc123]: Your message here
```

### Truncated Messages

Long messages are truncated. Read the full content:

```bash
agent-relay read abc123
```

## Agent Roles

Agent names automatically match role definitions:

```bash
# If .claude/agents/lead.md exists:
agent-relay -n Lead claude    # matches lead.md
agent-relay -n lead claude    # matches lead.md (case-insensitive)
```

### Creating Role Agents

Create role definitions in your project:

```
.claude/agents/
├── lead.md          # Coordinator
├── implementer.md   # Developer
├── designer.md      # UI/UX
└── reviewer.md      # Code review
```

Example role file (`.claude/agents/lead.md`):

```markdown
---
name: Lead
description: Project coordinator and architect
model: claude-sonnet-4-20250514
---

You are the lead developer coordinating this project.

Your responsibilities:
- Break down tasks and assign to team members
- Review completed work
- Ensure code quality and consistency
- Make architectural decisions

When delegating, use:
->relay:Implementer <<<
TASK: Description here>>>
```

## Spawning Agents Dynamically

From within an agent, spawn new agents:

```
->relay:spawn Worker1 claude "Implement the login endpoint"
```

Release when done:

```
->relay:release Worker1
```

## Multi-Project Orchestration

Bridge multiple projects with a single orchestrator:

```bash
# Start daemons in each project
cd ~/project-a && agent-relay up
cd ~/project-b && agent-relay up

# Bridge from anywhere
agent-relay bridge ~/project-a ~/project-b
```

### Cross-Project Messaging

```
# Message specific agent in specific project
->relay:project-a:Alice <<<
Please update the API>>>

# Broadcast to all leads across projects
->relay:*:Lead <<<
Standup in 5 minutes>>>
```

## Dashboard

The local dashboard at `http://localhost:3888` provides:

- **Real-time message feed** - See all agent communication
- **Agent status** - Active agents and their states
- **Message history** - Searchable message archive
- **System health** - Daemon status and metrics

## Configuration

### Config File

Create `~/.agent-relay/config.json`:

```json
{
  "dashboard": {
    "port": 3888,
    "host": "localhost"
  },
  "logging": {
    "level": "info"
  },
  "agents": {
    "defaultProvider": "claude"
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_RELAY_PORT` | Dashboard port | `3888` |
| `AGENT_RELAY_LOG_LEVEL` | Log verbosity | `info` |

## Teaching Agents to Use Relay

### Install the Skill

```bash
prpm install using-agent-relay
```

### Add to CLAUDE.md

```bash
prpm install @agent-relay/agent-relay-snippet
# or
prpm install @agent-relay/agent-relay-snippet --location CLAUDE.md
```

This teaches agents the messaging patterns automatically.

## Common Patterns

### Status Updates

```
->relay:* <<<
STATUS: Starting work on auth module>>>

->relay:* <<<
DONE: Auth module complete>>>
```

### Task Delegation

```
->relay:Developer <<<
TASK: Implement /api/register endpoint

Requirements:
- Email validation
- Password hashing
- Return JWT token>>>
```

### Asking Questions

```
->relay:Architect <<<
QUESTION: Should we use JWT or sessions for auth?

Context:
- Need to support mobile apps
- Multiple microservices>>>
```

### Code Review

```
->relay:Reviewer [thread:pr-123] <<<
REVIEW: Please check src/auth/*.ts

Focus on:
- Security issues
- Error handling
- Test coverage>>>
```

## Debugging

### Check Daemon Status

```bash
agent-relay status
```

### View Logs

```bash
# Daemon logs
agent-relay logs

# Follow logs
agent-relay logs -f
```

### List Active Agents

```bash
agent-relay status --agents
```

### Message History

```bash
# Recent messages
agent-relay history

# Filter by agent
agent-relay history --from Alice

# Filter by time
agent-relay history --since "1 hour ago"
```

## Troubleshooting

### "Daemon not running"

```bash
# Start the daemon
agent-relay up

# Check status
agent-relay status
```

### "tmux not found"

```bash
# Linux
sudo apt-get install tmux

# macOS
brew install tmux
```

### "Permission denied" on socket

```bash
# Remove stale socket
rm /tmp/agent-relay.sock

# Restart daemon
agent-relay down
agent-relay up
```

### Messages not delivering

1. Verify both agents are running: `agent-relay status`
2. Check agent names match exactly (case-insensitive)
3. Ensure message format is correct with `<<<` and `>>>`

### Agent crashes immediately

1. Check the AI CLI is installed (`claude --version`, `codex --version`)
2. Verify authentication with the provider
3. Check tmux is working: `tmux new-session -d -s test`

## Integration with Other Tools

### With Beads (Task Management)

```bash
# Pick a task
bd ready --json

# Update status
bd update <id> --status=in_progress

# Complete task
bd close <id> --reason "Completed"
```

### With claude-mem (Memory)

Agent observations are automatically captured when claude-mem is installed.

### With Git

```bash
# Prefix commits with task ID
git commit -m "[bd-123] Implement auth module"
```

## Next Steps

- **Scale up**: Try [Agent Relay Cloud](/docs/guides/CLOUD.md) for managed hosting
- **Self-host**: Deploy on your servers with [Self-Hosted Guide](/docs/guides/SELF-HOSTED.md)
- **Learn more**: Read the [Architecture](/ARCHITECTURE.md) docs

## Support

- **Documentation**: [docs.agent-relay.com](https://docs.agent-relay.com)
- **GitHub Issues**: [github.com/khaliqgant/agent-relay/issues](https://github.com/khaliqgant/agent-relay/issues)

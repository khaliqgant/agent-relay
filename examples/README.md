# Agent Relay Configuration Examples

This folder contains examples for configuring agent-relay in different environments.

## Configuration Files

| File | Description |
|------|-------------|
| `.env.example` | Environment variables for dotenv configuration |
| `cli-usage.sh` | CLI command examples and options |
| `programmatic-usage.ts` | Using agent-relay as a Node.js library |
| `slack-claude-bot.ts` | Slack bot with Claude Code via agent-relay |
| `slack-claude-standalone.ts` | Standalone Slack + Claude Code bot (no relay) |
| `docker-compose.yml` | Docker Compose setup for containerized deployment |
| `agent-relay.service` | Systemd service file for Linux servers |
| `team-config.json` | Team configuration with multiple agents |

## Usage Examples

| Directory | Description |
|-----------|-------------|
| `basic-chat/` | Simple two-agent chat example |
| `collaborative-task/` | Multi-agent collaboration workflow |

## Quick Start

### Environment Variables

Copy `.env.example` to your project root as `.env`:

```bash
cp examples/.env.example .env
```

Edit the values as needed. Agent-relay uses dotenv to load these automatically.

### CLI Configuration

All configuration can also be passed via CLI flags:

```bash
# Custom port and agent name
agent-relay up --port 4000
agent-relay -n MyAgent claude
```

### Programmatic Configuration

```typescript
import { Daemon, getProjectPaths } from 'agent-relay';

const paths = getProjectPaths();
const daemon = new Daemon({
  socketPath: paths.socketPath,
  storagePath: paths.dbPath,
});
```

## Slack Bot Examples

Two Slack bot examples are included - both use Claude Code CLI (your subscription, no API costs).

### Standalone Bot (Quick Test)

No agent-relay needed - just Slack + Claude Code:

```bash
# Install Slack SDK
npm install @slack/bolt

# Run (ensure `claude` CLI is logged in)
SLACK_BOT_TOKEN=xoxb-... SLACK_APP_TOKEN=xapp-... npx ts-node examples/slack-claude-standalone.ts
```

### Agent-Relay Bridge

Bridges Slack with your relay network - agents can send messages to Slack:

```bash
# Start relay daemon first
agent-relay up

# Run the bridge
SLACK_BOT_TOKEN=xoxb-... SLACK_APP_TOKEN=xapp-... npx ts-node examples/slack-claude-bot.ts
```

### Slack App Setup

1. Create app at https://api.slack.com/apps
2. Enable **Socket Mode** → copy App Token (`xapp-...`)
3. **OAuth & Permissions** → add scopes: `app_mentions:read`, `chat:write`
4. **Event Subscriptions** → subscribe to `app_mention`
5. Install to workspace → copy Bot Token (`xoxb-...`)

## Configuration Priority

1. CLI flags (highest priority)
2. Environment variables
3. Default values (lowest priority)

## Multi-Project Setup

Agent-relay automatically isolates data per project based on the project root directory. Each project gets its own:

- SQLite database
- Unix socket
- Message history

Projects are identified by a hash of their root path (detected via `.git`, `package.json`, etc.).

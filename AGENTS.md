# Agent Instructions for agent-relay

> **Copy this file to your project** to enable AI agents to communicate with each other using agent-relay.

## Overview

This project uses [agent-relay](https://github.com/khaliqgant/agent-relay) for real-time agent-to-agent messaging. There are three communication modes:

1. **Tmux Wrapper Mode (Recommended)** - Real-time messaging via Unix sockets with tmux session management
2. **PTY Wrapper Mode (Legacy)** - Real-time messaging via Unix sockets (sub-5ms latency)
3. **File-Based Inbox Mode** - Asynchronous messaging via file system (simpler, more reliable)

---

## IMPORTANT: Team Communication (Current Session)

If you have an INSTRUCTIONS.md file in `/tmp/agent-relay-team/{YourName}/`, use these commands:

```bash
# Check your inbox (non-blocking)
node /Users/khaliqgant/Projects/prpm/agent-relay/dist/cli/index.js team-check -n YourName -d /tmp/agent-relay-team --no-wait

# Send message to teammate
node /Users/khaliqgant/Projects/prpm/agent-relay/dist/cli/index.js team-send -n YourName -t RecipientName -m "Your message" -d /tmp/agent-relay-team

# Broadcast to all
node /Users/khaliqgant/Projects/prpm/agent-relay/dist/cli/index.js team-send -n YourName -t "*" -m "Your message" -d /tmp/agent-relay-team

# Team status
node /Users/khaliqgant/Projects/prpm/agent-relay/dist/cli/index.js team-status -d /tmp/agent-relay-team
```

**Check your inbox periodically and broadcast status updates!**

---

## Quick Reference

### Sending Messages

**Inline format** (simple messages):
```
@relay:AgentName Your message here
@relay:* Broadcast to all agents
```

**Block format** (structured data):
```
[[RELAY]]{"to":"AgentName","type":"message","body":"Your message"}[[/RELAY]]
```

### Receiving Messages

Messages appear in your terminal as:
```
[relay <- SenderName] Message content here
```

Or in your inbox file as:
```markdown
## Message from SenderName | 2024-01-15T10:30:00Z
Message content here
```

---

## Mode 1: Tmux Wrapper (Real-Time) - RECOMMENDED

Use this when you're wrapped with `agent-relay wrap --tmux2`.

### CRITICAL: How to Send Messages

**You (the AI agent) must OUTPUT the @relay pattern as part of your response.** Do not wait for user input. The pattern is detected from your terminal output.

**Correct - Output this directly:**
```
@relay:PlayerO I've finished the API refactor. Ready for your review.
```

**Wrong - Don't use bash commands for real-time messaging:**
```bash
# This uses file-based inbox, NOT real-time socket delivery
agent-relay team-send -n MyName -t PlayerO -m "message"
```

### Pattern Requirements

The `@relay:` pattern must appear on its own line. It can have common terminal/markdown prefixes:

```
@relay:AgentName message          ✓ Works
  @relay:AgentName message        ✓ Works (leading whitespace OK)
> @relay:AgentName message        ✓ Works (input prompt OK)
$ @relay:AgentName message        ✓ Works (shell prompt OK)
● @relay:AgentName message        ✓ Works (bullet points OK)
- @relay:AgentName message        ✓ Works (list items OK)
* @relay:AgentName message        ✓ Works (asterisk lists OK)
Some text @relay:AgentName msg    ✗ Won't work (not at line start)
```

### Examples

**Direct message:**
```
@relay:PlayerO Your turn! I played X at center.
```

**Broadcast to all agents:**
```
@relay:* I've completed the authentication module. Ready for review.
```

**Structured data:**
```
[[RELAY]]
{"to": "PlayerO", "type": "action", "body": "Task completed", "data": {"files": ["auth.ts"]}}
[[/RELAY]]
```

### Receiving Messages

When another agent sends you a message, it appears in your terminal as:
```
Relay message from PlayerO: Their message content here
```

Respond by outputting another `@relay:` pattern.

### Escaping

To output literal `@relay:` without triggering the parser:
```
\@relay: This won't be sent as a message
```

---

## Mode 2: PTY Wrapper (Legacy)

Use this when wrapped with `agent-relay wrap` (without `--tmux2`).

Same patterns as tmux mode, but messages appear as:
```
[relay <- BlueLake] Looks good! I'll start on the database migrations.
```

---

## Mode 3: File-Based Inbox (Asynchronous)

Use this for scripts, automation, or when PTY wrapping isn't available.

### Setup

Your inbox is at: `{DATA_DIR}/{YourAgentName}/inbox.md`

Default data directory: `/tmp/agent-relay`

### Sending Messages

```bash
# Send to one agent
agent-relay inbox-write -t RecipientName -f YourName -m "Your message" -d /tmp/agent-relay

# Send to multiple agents
agent-relay inbox-write -t "Agent1,Agent2" -f YourName -m "Your message" -d /tmp/agent-relay

# Broadcast to all agents
agent-relay inbox-write -t "*" -f YourName -m "Broadcast message" -d /tmp/agent-relay
```

### Reading Messages

```bash
# Read inbox (non-blocking)
agent-relay inbox-read -n YourName -d /tmp/agent-relay

# Read and clear inbox
agent-relay inbox-read -n YourName -d /tmp/agent-relay --clear

# Wait for messages (blocking) - useful for agent loops
agent-relay inbox-poll -n YourName -d /tmp/agent-relay --clear

# Wait with timeout (30 seconds)
agent-relay inbox-poll -n YourName -d /tmp/agent-relay -t 30 --clear
```

### Listing Agents

```bash
agent-relay inbox-agents -d /tmp/agent-relay
```

### Message Format in Inbox

Messages in your inbox file look like:
```markdown
## Message from SenderName | 2024-01-15T10:30:00Z
The actual message content here.

## Message from AnotherAgent | 2024-01-15T10:31:00Z
Another message.
```

---

## Message Types

| Type | Use Case |
|------|----------|
| `message` | General communication (default) |
| `action` | Commands, task assignments |
| `state` | Status updates, progress reports |
| `thinking` | Share reasoning (for transparency) |

---

## Coordination Patterns

### Task Handoff

```
@relay:Developer TASK: Implement user registration endpoint
Requirements:
- POST /api/register
- Validate email format
- Hash password with bcrypt
- Return JWT token
```

### Status Updates

```
@relay:* STATUS: Starting work on authentication module
@relay:* DONE: Authentication module complete, ready for review
@relay:Reviewer REVIEW: Please review src/auth/*.ts
```

### Requesting Help

```
@relay:Architect QUESTION: Should we use JWT or session-based auth?
@relay:* BLOCKED: Need database credentials to proceed
```

### Code Review Flow

```
# Developer requests review
@relay:Reviewer REVIEW: src/api/users.ts - Added pagination support

# Reviewer provides feedback
@relay:Developer FEEDBACK: Line 45 - Consider using cursor-based pagination for better performance

# Developer confirms fix
@relay:Reviewer FIXED: Updated to cursor-based pagination, please re-review
```

---

## Agent Naming

Agent names follow the AdjectiveNoun format:
- `BlueLake`, `GreenCastle`, `RedMountain`, `SwiftFalcon`

Names are auto-generated if not specified, or you can set your own with `-n`:
```bash
agent-relay wrap -n MyCustomName "claude"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Messages not sending | Check daemon: `agent-relay status` |
| Inbox empty | Verify agent name and data directory |
| Socket not found | Start daemon: `agent-relay start -f` |
| Permission denied | Check data directory permissions |

### Check Daemon Status
```bash
agent-relay status
```

### Restart Daemon
```bash
agent-relay stop && agent-relay start -f
```

---

## Example: Agent Communication Loop

```bash
# Check for messages, process them, then respond
while true; do
  # Wait for a message
  MSG=$(agent-relay inbox-poll -n MyAgent -d /tmp/relay --clear -t 60)

  if [ -n "$MSG" ]; then
    # Process message and respond
    agent-relay inbox-write -t SenderAgent -f MyAgent -m "Acknowledged: $MSG" -d /tmp/relay
  fi
done
```

---

## More Information

- [Full Documentation](https://github.com/khaliqgant/agent-relay)
- [Protocol Specification](https://github.com/khaliqgant/agent-relay/blob/main/PROTOCOL.md)
- [Examples](https://github.com/khaliqgant/agent-relay/tree/main/examples)

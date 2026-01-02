# Agent Relay

Real-time agent-to-agent messaging. Output `->relay:` patterns to communicate.

## Sending Messages

**Always use the fenced format** for reliable message delivery:

```
->relay:AgentName <<<
Your message here.>>>
```

```
->relay:* <<<
Broadcast to all agents.>>>
```

**CRITICAL:** Always close multi-line messages with `>>>` on its own line!

## Communication Protocol

**ACK immediately** - When you receive a task, acknowledge it before starting work:

```
->relay:Sender <<<
ACK: Brief description of task received>>>
```

Then proceed with your work. This confirms message delivery and lets the sender know you're on it.

**Report completion** - When done, send a completion message:

```
->relay:Sender <<<
DONE: Brief summary of what was completed>>>
```

## Receiving Messages

Messages appear as:
```
Relay message from Alice [abc123]: Message content here
```

### Channel Routing (Important!)

Messages from #general (broadcast channel) include a `[#general]` indicator:
```
Relay message from Alice [abc123] [#general]: Hello everyone!
```

**When you see `[#general]`**: Reply to `*` (broadcast), NOT to the sender directly.

```
# Correct - responds to #general channel
->relay:* <<<
Response to the group message.>>>

# Wrong - sends as DM to sender instead of to the channel
->relay:Alice <<<
Response to the group message.>>>
```

This ensures your response appears in the same channel as the original message.

If truncated, read full message:
```bash
agent-relay read abc123
```

## Spawning Agents

Spawn workers to delegate tasks:

```
->relay:spawn WorkerName claude "task description"
->relay:release WorkerName
```

## Threads

Use threads to group related messages together. Thread syntax:

```
->relay:AgentName [thread:topic-name] <<<
Your message here.>>>
```

**When to use threads:**
- Working on a specific issue (e.g., `[thread:agent-relay-299]`)
- Back-and-forth discussions with another agent
- Code review conversations
- Any multi-message topic you want grouped

**Examples:**

```
->relay:Protocol [thread:auth-feature] <<<
How should we handle token refresh?>>>

->relay:Frontend [thread:auth-feature] <<<
Use a 401 interceptor that auto-refreshes.>>>

->relay:Reviewer [thread:pr-123] <<<
Please review src/auth/*.ts>>>

->relay:Developer [thread:pr-123] <<<
LGTM, approved!>>>
```

Thread messages appear grouped in the dashboard with reply counts.

## Common Patterns

```
->relay:Lead <<<
ACK: Starting /api/register implementation>>>

->relay:* <<<
STATUS: Working on auth module>>>

->relay:Lead <<<
DONE: Auth module complete>>>

->relay:Developer <<<
TASK: Implement /api/register>>>

->relay:Reviewer [thread:code-review-auth] <<<
REVIEW: Please check src/auth/*.ts>>>

->relay:Architect <<<
QUESTION: JWT or sessions?>>>
```

## Cross-Project Messaging

When running in bridge mode (multiple projects connected), use `project:agent` format:

```
->relay:frontend:Designer <<<
Please update the login UI for the new auth flow>>>

->relay:backend:lead <<<
API question - should we use REST or GraphQL?>>>

->relay:shared-lib:* <<<
New utility functions available, please pull latest>>>
```

**Format:** `->relay:project-id:agent-name`

**Special targets:**
- `->relay:project:lead` - Message the lead agent of that project
- `->relay:project:*` - Broadcast to all agents in that project
- `->relay:*:*` - Broadcast to ALL agents in ALL projects

**Cross-project threads:**
```
->relay:frontend:Designer [thread:auth-feature] <<<
UI mockups ready for review>>>
```

## Rules

- Pattern must be at line start (whitespace OK)
- Escape with `\->relay:` to output literally
- Check daemon status: `agent-relay status`

## Session Persistence (Required)

Output these blocks to maintain session state. **The system monitors your output for these patterns.**

### Progress Summary (Output Periodically)

When completing significant work, output a summary block:

```
[[SUMMARY]]
{
  "currentTask": "What you're working on now",
  "completedTasks": ["task1", "task2"],
  "context": "Important context for session recovery",
  "files": ["src/file1.ts", "src/file2.ts"]
}
[[/SUMMARY]]
```

**When to output:**
- After completing a major task
- Before long-running operations
- When switching to a different area of work
- Every 10-15 minutes of active work

### Session End (Required on Completion)

When your work session is complete, output:

```
[[SESSION_END]]
{
  "summary": "Brief description of what was accomplished",
  "completedTasks": ["task1", "task2", "task3"]
}
[[/SESSION_END]]
```

Or for a simple close: `[[SESSION_END]]Work complete.[[/SESSION_END]]`

**This enables:**
- Session recovery if connection drops
- Progress tracking in dashboard
- Proper session cleanup in cloud

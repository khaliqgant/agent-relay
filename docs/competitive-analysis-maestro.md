# Competitive Analysis: Agent Orchestration Tools vs agent-relay

This document analyzes four projects in the AI agent tooling space:
1. **pedramamini/Maestro** - Electron desktop app for agent orchestration
2. **23blocks-OS/ai-maestro** - Web dashboard for distributed agent management
3. **steipete/Clawdis** - Personal AI assistant with multi-surface delivery
4. **winfunc/opcode** - Desktop GUI for Claude Code session management (19.5k+ stars)

---

# Part 1: pedramamini/Maestro

## Executive Summary

| Aspect | Maestro | agent-relay |
|--------|---------|-------------|
| **Type** | Desktop GUI (Electron) | CLI Tool (Node.js) |
| **Architecture** | Dual-process PTY + child process | PTY wrapper + Unix socket daemon |
| **Agent Integration** | Multi-provider with adapters | Universal (pattern-based) |
| **Coordination** | Moderator AI routing | Direct peer-to-peer messaging |
| **Automation** | Playbook/Auto-Run (markdown files) | None (real-time only) |
| **Session Management** | Discovers & resumes past sessions | Fresh sessions only |
| **Complexity** | ~15,000+ lines TypeScript/React | ~7,000 lines TypeScript |
| **Target User** | Power users managing many agents | Developers needing quick agent coordination |

---

## Architecture Deep Dive

### Maestro: Electron Desktop App

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ├─ ProcessManager (dual AI + terminal per session)         │
│  ├─ electron-store (settings persistence)                   │
│  └─ IPC Bridge (contextBridge isolation)                    │
└─────────────────┬─────────────────┬─────────────────────────┘
                  │                 │
    ┌─────────────▼────────┐ ┌──────▼─────────────┐
    │   AI Agent Process   │ │  Terminal Process  │
    │  (child_process)     │ │  (node-pty)        │
    │  --print --json      │ │  full shell        │
    └──────────────────────┘ └────────────────────┘
                  │
    ┌─────────────▼────────────────────────────────┐
    │              Output Parser Layer             │
    │  ├─ Claude Code parser                       │
    │  ├─ Codex parser                             │
    │  └─ OpenCode parser                          │
    │  (normalize to ParsedEvent: init/text/tool)  │
    └──────────────────────────────────────────────┘
                  │
    ┌─────────────▼────────────────────────────────┐
    │           React Renderer (IPC-only)          │
    │  ├─ Three-panel layout                       │
    │  ├─ useSessionManager hook                   │
    │  ├─ useAgentCapabilities hook                │
    │  └─ Layer stack (modal management)           │
    └──────────────────────────────────────────────┘
```

**Key Design Decisions:**

1. **Dual-Process Model** - Each session runs TWO processes:
   - AI process (`-ai` suffix): Spawned via `child_process.spawn()` in batch mode
   - Terminal process (`-terminal` suffix): Full PTY via `node-pty`
   - Toggle between them with `Cmd+J`

2. **Batch Mode Invocation** - Claude Code runs with `--print --output-format json`:
   - Prompts passed as CLI arguments
   - Agent exits after each response
   - For images: switches to stream-json, sends JSONL via stdin

3. **Capability-Gated UI** - Central capability declaration per agent:
   ```typescript
   {
     supportsSessionResumption: true,
     supportsReadOnlyMode: true,
     supportsStreaming: true,
     supportsImages: true,
     supportsSlashCommands: true
   }
   ```
   UI components use `useAgentCapabilities()` to hide unsupported features.

4. **Strict Context Isolation** - Renderer has zero Node.js access:
   ```
   Renderer (React) ──IPC──> Preload Script ──Node.js──> Main Process
   ```

### agent-relay: CLI Daemon Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Terminal                           │
│              (attached to tmux session)                     │
└────────────────────────────┬────────────────────────────────┘
                             │ tmux attach
┌────────────────────────────▼────────────────────────────────┐
│                     Tmux Session                            │
│  ├─ Agent Process (claude, codex, gemini)                   │
│  ├─ Silent Polling (capture-pane @ 200ms)                   │
│  ├─ Pattern Detection (->relay:)                            │
│  └─ Message Injection (send-keys)                           │
└────────────────────────────┬────────────────────────────────┘
                             │ Unix Socket IPC
┌────────────────────────────▼────────────────────────────────┐
│                     Daemon (Router)                         │
│  ├─ Connection State Machine                                │
│  ├─ Message Routing (direct + broadcast)                    │
│  ├─ SQLite Persistence                                      │
│  └─ Dashboard (WebSocket)                                   │
└─────────────────────────────────────────────────────────────┘
```

**Key Difference:** agent-relay wraps any agent transparently via pattern detection, while Maestro spawns agents in controlled batch mode with provider-specific adapters.

---

## How Agent-to-Agent Communication Works (pedramamini/Maestro)

**Critical Insight:** pedramamini's Maestro does **NOT** have direct agent-to-agent messaging. Instead, it uses a **moderator-mediated group chat** pattern.

### Group Chat Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         USER                                      │
│                          │                                        │
│                          ▼                                        │
│              ┌───────────────────────┐                           │
│              │    Moderator AI       │  (dedicated Claude session)│
│              │  - Receives question  │                           │
│              │  - Parses @mentions   │                           │
│              │  - Spawns agents      │                           │
│              └───────────┬───────────┘                           │
│                          │                                        │
│         ┌────────────────┼────────────────┐                      │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│   │ Agent A  │    │ Agent B  │    │ Agent C  │                  │
│   │ (spawn)  │    │ (spawn)  │    │ (spawn)  │                  │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘                  │
│        │               │               │                         │
│        └───────────────┼───────────────┘                         │
│                        ▼                                          │
│              ┌───────────────────────┐                           │
│              │    Moderator AI       │  (synthesizes responses)  │
│              │  - Collects responses │                           │
│              │  - May @mention again │                           │
│              │  - Returns to user    │                           │
│              └───────────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **User asks question** → Moderator AI receives it with full chat history
2. **Moderator parses @mentions** → Identifies which agents to query
3. **Agents spawned in parallel** → Each runs as separate child process
4. **Agents respond asynchronously** → Router tracks pending responses
5. **Moderator synthesizes** → Either:
   - **@mentions more agents** (loop continues)
   - **No @mentions** (returns final answer to user)

### Session ID Pattern

Messages are tracked by session IDs:
```
group-chat-{chatId}-moderator-{timestamp}     # Moderator messages
group-chat-{chatId}-participant-{name}-{timestamp}  # Agent responses
```

### Key Limitation

**Agents cannot talk directly to each other.** All communication is mediated by:
1. The **Moderator AI** (decides who to ask)
2. The **ProcessManager** (spawns/collects responses)

This is fundamentally different from agent-relay's peer-to-peer model where Alice can message Bob directly.

### IPC Implementation

Maestro uses Electron's IPC for internal communication:
```
Renderer (React) ──IPC──> Preload Script ──> Main Process ──> ProcessManager
                                                                    │
                                                    ┌───────────────┴───────────────┐
                                                    ▼                               ▼
                                              AI Process                      Terminal Process
                                           (child_process)                       (node-pty)
```

Events emitted:
- `onData` - Agent output chunks
- `onAssistantChunk` - Streaming thinking (when "Show Thinking" enabled)
- `onResult` - Final response

---

## Feature Comparison

### 1. Agent Coordination Model

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **Topology** | Hub & Spoke (moderator) | Peer-to-peer mesh |
| **Routing** | AI moderator routes messages | Direct addressing |
| **Group Chat** | Moderator synthesizes responses | Broadcast to all |
| **Iteration** | Moderator loops until resolved | Manual follow-up |

**Maestro's Moderator Pattern:**
```
User → Moderator AI → @mentions agents → Agents respond → Moderator synthesizes
                   ↑                                              │
                   └──────── (loops until no more @mentions) ─────┘
```

**agent-relay's Direct Pattern:**
```
Alice ──→relay:Bob──→ Bob
Alice ──→relay:*───→ [All agents]
```

**Winner: Depends on use case**
- Maestro's moderator is better for complex cross-project questions requiring synthesis
- agent-relay's direct messaging is faster for targeted coordination

### 2. Session Management

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **Discovery** | Auto-discovers past Claude sessions | None |
| **Resume** | Resume any historical conversation | Fresh only |
| **Multi-tab** | Multiple AI tabs per session | One session per agent |
| **Context Transfer** | Compact/merge/transfer between agents | None |

**Maestro excels here** - It discovers sessions from `~/.claude/projects/` and allows resuming conversations from before Maestro was even installed. Context can be compacted, merged, or transferred between different agents.

### 3. Automation (Auto-Run)

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **Task Runner** | Markdown checklist processing | None |
| **Playbooks** | Save & replay task sequences | None |
| **Isolation** | Fresh session per task | N/A |
| **Loop Mode** | Reset on completion | N/A |

**Maestro's Auto-Run System:**
- Processes markdown documents with checkboxes
- Each task gets its own fresh AI session (prevents context bleed)
- Playbooks can be saved and run from CLI/cron
- "Reset on Completion" enables infinite loops

This is a **major differentiator** - Maestro enables unattended batch processing while agent-relay is purely real-time.

### 4. Git Integration

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **Worktrees** | Native support, isolated branches | None |
| **Sub-agents** | Indented under parent session | None |
| **PR Creation** | Via `gh` CLI integration | None |
| **Branch Display** | In session header | None |

**Maestro's Git Worktrees:**
- Run parallel agents on isolated branches
- Each worktree session has own working directory, history, and state
- Sub-agents appear indented in sidebar

### 5. Multi-Provider Support

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **Providers** | Claude Code, Codex, OpenCode | Any (pattern-based) |
| **Adapters** | Per-provider parsers | Universal |
| **Capabilities** | Provider-specific feature flags | None |
| **Planned** | Gemini, Qwen3 | N/A |

**Maestro's Adapter Pattern:**
```typescript
// Each agent requires 5 implementations:
1. Agent Definition (CLI binary, args, detection)
2. Capabilities Declaration (boolean feature flags)
3. Output Parser (agent JSON → normalized events)
4. Session Storage (optional history browsing)
5. Error Patterns (failure recovery rules)
```

**Normalized Event Types:** `init`, `text`, `tool_use`, `result`, `error`, `usage`

**agent-relay's approach** is simpler but less feature-rich - any agent works via stdout pattern detection.

### 6. Remote Access

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **Mobile** | PWA with QR code | Dashboard only |
| **Remote Tunnel** | Cloudflare integration | None |
| **Offline Queue** | Yes | No |

Maestro has a full mobile web interface with offline queuing and swipe gestures.

### 7. CLI & Headless Operation

| Feature | Maestro | agent-relay |
|---------|---------|-------------|
| **CLI Tool** | `maestro-cli` | `agent-relay` |
| **Headless Mode** | Full (run playbooks) | Partial (daemon only) |
| **Output Format** | Human-readable + JSONL | Text |
| **CI/CD Integration** | Yes (cron, pipelines) | No |

---

## Key Insights & Learnings

### What Maestro Does Better

1. **Session Discovery & Resume**
   - Finds all past Claude sessions automatically
   - Resume any conversation, even pre-Maestro
   - Critical for long-running projects

2. **Auto-Run / Playbook System**
   - Batch process markdown task lists
   - Fresh session per task (no context bleed)
   - Enables unattended multi-day operation
   - Save and replay playbooks

3. **Moderator-Based Group Chat**
   - AI routes questions to right agents
   - Synthesizes responses intelligently
   - Loops until properly answered
   - Better for complex cross-cutting questions

4. **Git Worktree Integration**
   - Parallel agents on isolated branches
   - Sub-agent hierarchy in UI
   - Native PR workflow

5. **Context Management**
   - Compact to stay within token limits
   - Merge conversations
   - Transfer between agents (Claude → Codex)

6. **Multi-Provider Architecture**
   - Capability-gated UI adapts per agent
   - Normalized event stream
   - Easy to add new providers

### What agent-relay Does Better

1. **Zero Configuration**
   - Pattern-based detection (`->relay:`)
   - Works with ANY agent out of the box
   - No adapters or parsers needed

2. **Ultra-Low Latency**
   - <5ms Unix socket IPC
   - Maestro: HTTP overhead for web interface

3. **Transparent Operation**
   - User stays in real terminal
   - Doesn't change how agents run
   - No batch mode required

4. **Simplicity**
   - ~7k lines vs ~15k+ lines
   - Single mental model
   - Quick to understand

5. **Direct Messaging**
   - Peer-to-peer without moderator overhead
   - Faster for simple coordination
   - Less token usage

---

## Architecture Trade-offs

| Decision | Maestro | agent-relay |
|----------|---------|-------------|
| **Agent Control** | Full (batch mode spawn) | None (pattern detection) |
| **Feature Depth** | Rich per-provider features | Universal but basic |
| **Setup Complexity** | Desktop app install | npm package |
| **Resource Usage** | Higher (Electron + React) | Lower (Node.js daemon) |
| **Extensibility** | Adapter pattern | Pattern extensions |
| **Offline Capable** | Yes (full desktop app) | No (daemon required) |

---

## Recommended Improvements for agent-relay

### High Priority (Learn from Maestro)

1. **Session Resume Capability**
   - Track session IDs per agent
   - `agent-relay resume <session-id>`
   - Store in SQLite with agent metadata

2. **Simple Automation Mode**
   - Process a markdown checklist
   - `agent-relay autorun tasks.md`
   - Fresh context per task option

3. **Agent Metadata Registry**
   - Track capabilities per agent
   - Store program, model, task description
   - Better agent discovery

### Medium Priority

4. **Context Compaction Helper**
   - Detect context limits
   - Suggest/auto-compact
   - Transfer between agents

5. **Git Worktree Support**
   - `agent-relay -n Alice --worktree feature-x`
   - Isolated branch per agent

6. **Moderator Mode (Optional)**
   - `->relay:group Question for everyone`
   - AI synthesizes responses
   - Opt-in, not default

### Lower Priority

7. **Mobile Web Interface**
   - Extend dashboard with mobile-friendly view
   - QR code for easy access

8. **Playbook System**
   - Save message sequences
   - Replay for common workflows

---

## Positioning

| Segment | Recommended Tool |
|---------|------------------|
| **Quick prototyping, 2-5 agents** | agent-relay |
| **Long-running autonomous ops** | Maestro |
| **Cross-project coordination** | Maestro |
| **Simple peer-to-peer messaging** | agent-relay |
| **CI/CD integration** | Maestro |
| **Universal agent support** | agent-relay |

---

## Conclusion

**Maestro** is a power-user desktop application designed for managing large fleets of AI agents over extended periods. Its killer features are Auto-Run (unattended batch processing), session discovery/resume, and moderator-based group chat. The trade-off is complexity and resource usage.

**agent-relay** is an elegantly simple CLI tool for real-time agent coordination. Its killer features are zero-config pattern detection, ultra-low latency, and universal agent support. The trade-off is limited automation and session management.

The tools serve different niches:
- **Maestro**: "Run AI coding agents autonomously for days"
- **agent-relay**: "Real-time agent-to-agent messaging"

agent-relay could adopt Maestro's best ideas (session resume, simple autorun) while preserving its core simplicity advantage.

---

---

# Part 2: 23blocks-OS/ai-maestro

## Executive Summary

| Aspect | ai-maestro (23blocks) | agent-relay |
|--------|----------------------|-------------|
| **Type** | Web Dashboard (Next.js) | CLI Tool (Node.js) |
| **Architecture** | Manager/Worker + tmux | PTY wrapper + Unix socket daemon |
| **Agent Integration** | tmux session discovery | Pattern-based detection |
| **Communication** | File-based + tmux injection | Unix socket IPC |
| **Distributed** | Yes (Tailscale VPN) | No (local only) |
| **Persistence** | CozoDB + file system | SQLite |
| **Complexity** | ~10,000+ lines | ~7,000 lines |
| **Target User** | Teams with distributed agents | Developers with local agents |

---

## Architecture Deep Dive

### 23blocks ai-maestro: Manager/Worker Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    Manager Machine                               │
│                    (localhost:23000)                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Next.js Web Dashboard                         │  │
│  │  ├─ Agent list (3-level hierarchy)                        │  │
│  │  ├─ Real-time terminal streaming (WebSocket)              │  │
│  │  ├─ Message inbox/outbox UI                               │  │
│  │  └─ Code graph visualization                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                    ┌─────────┴─────────┐                        │
│                    ▼                   ▼                        │
│             ┌───────────┐       ┌───────────────┐               │
│             │  CozoDB   │       │  File System  │               │
│             │ (memory)  │       │ (messages)    │               │
│             └───────────┘       └───────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Local Worker   │  │  Remote Worker  │  │  Remote Worker  │
│  (tmux sessions)│  │  (via Tailscale)│  │  (via SSH)      │
│                 │  │                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │ Claude Code │ │  │ │   Aider     │ │  │ │   Cursor    │ │
│ │ (tmux sess) │ │  │ │ (tmux sess) │ │  │ │ (tmux sess) │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │
│ ┌─────────────┐ │  │                 │  │                 │
│ │   Copilot   │ │  │                 │  │                 │
│ │ (tmux sess) │ │  │                 │  │                 │
│ └─────────────┘ │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## How Agent-to-Agent Communication Works (23blocks ai-maestro)

**Key Insight:** 23blocks ai-maestro has **TRUE** agent-to-agent messaging via a dual-channel system.

### Dual-Channel Communication Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHANNEL 1: FILE-BASED (Persistent)            │
│                                                                  │
│  ~/.aimaestro/messages/                                         │
│  ├── inbox/                                                     │
│  │   ├── agent-alice/                                           │
│  │   │   ├── msg-001.json  (from Bob, priority: urgent)        │
│  │   │   └── msg-002.json  (from Charlie, priority: normal)    │
│  │   └── agent-bob/                                             │
│  │       └── msg-003.json  (from Alice, type: request)         │
│  └── outbox/                                                    │
│      ├── agent-alice/                                           │
│      └── agent-bob/                                             │
│                                                                  │
│  Message Format:                                                 │
│  {                                                               │
│    "from": "agent-alice",                                        │
│    "to": "agent-bob",                                            │
│    "priority": "urgent|high|normal|low",                        │
│    "type": "request|response|notification|update",              │
│    "content": "...",                                             │
│    "metadata": {...},                                            │
│    "read": false                                                 │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CHANNEL 2: TMUX INJECTION (Real-time)        │
│                                                                  │
│  Methods:                                                        │
│  ├── display  → Non-intrusive popup (auto-dismisses)            │
│  ├── inject   → Message in terminal scrollback                  │
│  └── echo     → Formatted critical alert                        │
│                                                                  │
│  Tool: send-tmux-message.sh                                      │
│  Usage: ./send-tmux-message.sh <agent-name> "message" [method]  │
└─────────────────────────────────────────────────────────────────┘
```

### Communication Flow

```
Alice wants to message Bob:

Option A: File-Based (Persistent)
┌─────────┐  send-aimaestro-message.sh  ┌──────────────────────────┐
│  Alice  │ ─────────────────────────→ │ ~/.aimaestro/messages/   │
└─────────┘                             │   inbox/agent-bob/       │
                                        │     msg-new.json         │
                                        └────────────┬─────────────┘
                                                     │
┌─────────┐  check-and-show-messages.sh              │
│   Bob   │ ←────────────────────────────────────────┘
└─────────┘  (polls or triggered)

Option B: Tmux Injection (Immediate)
┌─────────┐  send-tmux-message.sh       ┌─────────┐
│  Alice  │ ─────────────────────────→ │   Bob   │
└─────────┘  (tmux send-keys)           │ (sees   │
                                        │  alert) │
                                        └─────────┘
```

### CLI Tools for Agents

| Tool | Purpose |
|------|---------|
| `send-aimaestro-message.sh` | Send structured JSON message to inbox |
| `forward-aimaestro-message.sh` | Forward message preserving context |
| `check-and-show-messages.sh` | Display unread messages |
| `check-new-messages-arrived.sh` | Get unread count |
| `send-tmux-message.sh` | Instant terminal notification |

### Claude Code Integration

Agents can use natural language via a Claude skill:
```
"Send a message to backend-architect asking them to implement POST /api/users"
```

The skill translates this to the appropriate shell command.

### Key Difference from pedramamini/Maestro

| Aspect | pedramamini/Maestro | 23blocks/ai-maestro |
|--------|---------------------|---------------------|
| **Direct A2A** | No (moderator only) | Yes (file + tmux) |
| **Persistence** | Via moderator context | JSON files on disk |
| **Real-time** | No | Yes (tmux injection) |
| **Protocol** | Electron IPC | File system + tmux |

---

## Feature Comparison with agent-relay

### 1. Agent-to-Agent Messaging

| Feature | ai-maestro (23blocks) | agent-relay |
|---------|----------------------|-------------|
| **Direct Messaging** | Yes (file + tmux) | Yes (pattern-based) |
| **Persistence** | JSON files in inbox | SQLite |
| **Real-time** | tmux injection | Unix socket |
| **Priority Levels** | urgent/high/normal/low | None |
| **Message Types** | request/response/notification/update | None |
| **Read Tracking** | Auto-mark as read | None |

**Winner: ai-maestro** - Richer message metadata and dual-channel approach.

### 2. Distributed Architecture

| Feature | ai-maestro (23blocks) | agent-relay |
|---------|----------------------|-------------|
| **Multi-machine** | Yes (manager/worker) | No |
| **VPN Support** | Tailscale built-in | None |
| **Remote Workers** | SSH + WebSocket proxy | None |
| **Mobile Access** | Yes (touch-optimized) | Dashboard only |

**Winner: ai-maestro** - True distributed architecture.

### 3. Agent Discovery

| Feature | ai-maestro (23blocks) | agent-relay |
|---------|----------------------|-------------|
| **Auto-discovery** | tmux session scanning | HELLO handshake |
| **Naming** | 3-level hierarchy (project-module-task) | Flat names |
| **Grouping** | Dynamic color-coded groups | None |
| **Health Monitoring** | Connection indicators | Online/offline |

**Winner: ai-maestro** - Better organization for many agents.

### 4. Intelligence Features

| Feature | ai-maestro (23blocks) | agent-relay |
|---------|----------------------|-------------|
| **Code Graph** | AST parsing (Ruby, TS, Python) | None |
| **Delta Indexing** | Yes (~100ms updates) | None |
| **Semantic Search** | Across all conversations | None |
| **Auto-docs** | Extracted from code | None |

**Winner: ai-maestro** - Significant code intelligence layer.

### 5. Portability

| Feature | ai-maestro (23blocks) | agent-relay |
|---------|----------------------|-------------|
| **Export** | .zip with metadata | None |
| **Import** | Conflict detection | None |
| **Cross-host** | Yes | No |
| **Clone/Backup** | Yes | None |

**Winner: ai-maestro** - Full agent portability.

### 6. Setup & Simplicity

| Feature | ai-maestro (23blocks) | agent-relay |
|---------|----------------------|-------------|
| **One-liner Install** | Yes (curl script) | npm install |
| **Dependencies** | Node.js, tmux, PM2 | Node.js only |
| **Config** | .env.local + scripts | Minimal |
| **Learning Curve** | Moderate | Very low |

**Winner: agent-relay** - Simpler to understand and use.

---

## Key Insights from 23blocks ai-maestro

### What It Does Better Than agent-relay

1. **True Distributed Architecture**
   - Manager/worker model across machines
   - Tailscale VPN for secure remote access
   - WebSocket proxying for remote terminals

2. **Dual-Channel Messaging**
   - Persistent file-based with priorities
   - Real-time tmux injection
   - Best of both worlds

3. **Rich Message Metadata**
   - Priority levels (urgent/high/normal/low)
   - Message types (request/response/notification/update)
   - Auto-read tracking

4. **Agent Hierarchy & Organization**
   - 3-level naming (project-backend-api)
   - Auto-grouping with color coding
   - Better for 10+ agents

5. **Code Intelligence**
   - Multi-language AST parsing
   - Delta indexing (100ms updates)
   - Semantic conversation search

6. **Agent Portability**
   - Export to .zip with full metadata
   - Import with conflict detection
   - Cross-machine transfer

### What agent-relay Does Better

1. **Zero Dependencies** - Just Node.js, no tmux/PM2 required
2. **Ultra-Low Latency** - <5ms vs file system polling
3. **Universal Agents** - Pattern works with any CLI agent
4. **Simpler Mental Model** - One pattern (`->relay:`) vs multiple tools
5. **Lighter Footprint** - No database, no background services

---

## Recommended Adoptions for agent-relay

### From 23blocks ai-maestro

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P1 | Message priority levels | Low | Medium |
| P1 | Message type classification | Low | Medium |
| P1 | Read/unread tracking | Low | Medium |
| P2 | Agent hierarchy naming | Medium | Medium |
| P2 | Agent export/import | Medium | Low |
| P3 | Distributed workers | High | Medium |

### Suggested Implementation

```
# Enhanced message pattern
->relay:Bob [priority:urgent] [type:request] Please review PR #123

# Agent hierarchy
agent-relay -n project-backend-api claude

# Export agent state
agent-relay export agent-name > agent-backup.json
```

---

## Maestro Projects Comparison

| Feature | pedramamini/Maestro | 23blocks/ai-maestro | agent-relay |
|---------|---------------------|---------------------|-------------|
| **Type** | Desktop (Electron) | Web (Next.js) | CLI (Node.js) |
| **Agent A2A** | No (moderator) | Yes (file+tmux) | Yes (pattern) |
| **Distributed** | No | Yes | No |
| **Automation** | Playbooks | No | No |
| **Session Resume** | Yes | No | No |
| **Code Intelligence** | No | Yes (AST) | No |
| **Setup Complexity** | High | Medium | Low |
| **Latency** | ~100ms | ~500ms (file) | <5ms |

*See Part 4 for full four-way comparison including Clawdis.*

---

## Conclusion

**pedramamini/Maestro** is best for: Power users running long autonomous sessions with playbook automation and session management. No direct A2A - relies on AI moderator.

**23blocks/ai-maestro** is best for: Teams with distributed agents across machines needing rich messaging and code intelligence. True A2A via file+tmux.

**agent-relay** is best for: Developers wanting fast, simple, direct agent coordination with minimal setup. True A2A via patterns.

### Positioning Matrix

| Use Case | Recommended Tool |
|----------|------------------|
| Local quick coordination | agent-relay |
| Long autonomous sessions | pedramamini/Maestro |
| Distributed team agents | 23blocks/ai-maestro |
| Code intelligence | 23blocks/ai-maestro |
| Playbook automation | pedramamini/Maestro |
| Minimal dependencies | agent-relay |

---

## Sources

### pedramamini/Maestro
- [Maestro GitHub Repository](https://github.com/pedramamini/Maestro)
- [Maestro README](https://raw.githubusercontent.com/pedramamini/Maestro/main/README.md)
- [Maestro ARCHITECTURE.md](https://raw.githubusercontent.com/pedramamini/Maestro/main/ARCHITECTURE.md)
- [Maestro AGENT_SUPPORT.md](https://raw.githubusercontent.com/pedramamini/Maestro/main/AGENT_SUPPORT.md)

### 23blocks-OS/ai-maestro
- [ai-maestro GitHub Repository](https://github.com/23blocks-OS/ai-maestro)
- [ai-maestro Website](https://ai-maestro.23blocks.com/)

---

---

# Part 3: steipete/Clawdis

## Executive Summary

| Aspect | Clawdis | agent-relay |
|--------|---------|-------------|
| **Type** | Personal AI Assistant (Node.js + Electron) | CLI Tool (Node.js) |
| **Architecture** | Gateway Hub + RPC Agent | PTY wrapper + Unix socket daemon |
| **Agent Integration** | Pi runtime (RPC mode) | Universal (pattern-based) |
| **Communication** | WebSocket JSON-RPC | Unix socket IPC |
| **Multi-Surface** | WhatsApp, Telegram, WebChat | CLI only |
| **Distributed** | Node pairing via TCP bridge | No (local only) |
| **Target User** | Personal assistant across devices | Developers coordinating agents |

---

## Architecture Deep Dive

### Clawdis: Gateway Hub Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GATEWAY (Control Plane)                           │
│                    ws://127.0.0.1:18789                             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              HTTP + WebSocket Server                            │ │
│  │  ├─ 41+ RPC Methods (config, sessions, chat, agent, cron)      │ │
│  │  ├─ 11 Event Types (agent, chat, presence, health, node.pair)  │ │
│  │  ├─ AJV validates frames against TypeBox schemas               │ │
│  │  └─ Idempotency: TTL 5min, cap 1000 entries                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                 │
│   ┌───────────┐       ┌───────────┐       ┌───────────┐            │
│   │  Provider │       │  Provider │       │  Provider │            │
│   │ WhatsApp  │       │ Telegram  │       │  WebChat  │            │
│   └───────────┘       └───────────┘       └───────────┘            │
└─────────────────────────────────────────────────────────────────────┘
           │                                          │
           │ WebSocket                                │ TCP Bridge
           ▼                                          ▼ (port 18790)
┌───────────────────┐                    ┌─────────────────────────┐
│  Pi Agent Runtime │                    │     Remote Nodes        │
│  (embedded RPC)   │                    │  (iOS/Android/macOS)    │
│  ├─ bash-tools    │                    │  ├─ Node pairing        │
│  ├─ skills        │                    │  ├─ Canvas rendering    │
│  └─ clawdis-tools │                    │  └─ Voice wake          │
└───────────────────┘                    └─────────────────────────┘
```

---

## How Communication Works (Clawdis)

**Key Insight:** Clawdis has **NO direct agent-to-agent or device-to-agent communication**. Everything is mediated by the Gateway.

### Hub-Mediated Flow

```
User (WhatsApp) → Gateway → Pi Agent → Gateway → User (WhatsApp)
                    ↑                      │
                    └──────────────────────┘
                    (all through gateway)
```

### WebSocket Protocol

**Frame Structure:**
```typescript
{
  type: "event" | "request" | "response",
  method: string,        // RPC method name
  event: string,         // for broadcasts
  payload: any,          // data
  seq: number,           // deduplication
  stateVersion: number   // presence tracking
}
```

**Key RPC Methods (41+):**
| Category | Methods |
|----------|---------|
| Config | `config.get`, `config.set` |
| Sessions | `sessions.list`, `sessions.patch`, `sessions.reset`, `sessions.compact` |
| Chat | `chat.send`, `chat.history`, `chat.abort` |
| Agent | `agent`, `send`, `wake` |
| Node Pairing | `node.pair.request`, `node.pair.approve`, `node.pair.verify` |

### Node Pairing Protocol

```
Remote Node                              Gateway
    │                                       │
    │──── Pairing Request ─────────────────>│
    │     (platform, version, capabilities) │
    │                                       │ (pending 5min TTL)
    │                                       │
    │<─── Approval + Token ─────────────────│
    │     (UUID-based token)                │
    │                                       │
    │──── Subsequent Connections ──────────>│
    │     (nodeId + token verification)     │
```

### Idempotency System

Clawdis prevents duplicate messages on reconnect:
- TTL cache: 5 minutes
- Max entries: 1000
- Required for: `send`, `agent`, `chat.send`

---

## Key Features

### 1. Multi-Surface Delivery
Same agent answers on WhatsApp, Telegram, and WebChat simultaneously.

### 2. Single Agent Runtime (Pi)
Only ONE agent runtime - no agent-to-agent messaging.

### 3. Node Pairing
Secure device registration with token-based authentication for iOS/Android/macOS.

### 4. Canvas Host
Real-time collaborative visualization at `/canvas/`.

---

## Comparison with agent-relay

| Feature | Clawdis | agent-relay |
|---------|---------|-------------|
| **Direct A2A** | No | Yes |
| **Multi-Surface** | Yes (WhatsApp/Telegram/Web) | No (CLI only) |
| **Node Pairing** | Yes (TCP bridge) | No |
| **Idempotency** | Yes (5min TTL) | No |
| **Latency** | ~50-100ms (WebSocket) | <5ms (Unix socket) |
| **Agent Count** | 1 (Pi only) | Unlimited |

---

## Key Insights from Clawdis

### What It Does Better

1. **Idempotency Layer** - Prevents duplicate sends on reconnect
2. **Multi-Surface Abstraction** - One agent, many delivery channels
3. **Node Pairing Protocol** - Secure distributed device registration
4. **Schema Validation** - AJV + TypeBox for all frames

### What agent-relay Does Better

1. **Direct A2A Messaging** - Agents talk directly, not via hub
2. **Multiple Agents** - Coordinate many agents, not just one
3. **Ultra-Low Latency** - <5ms vs ~100ms
4. **Universal Agents** - Works with any CLI agent

---

---

# Part 4: Consolidated Recommendations

## Five-Way Comparison

| Feature | pedramamini/Maestro | 23blocks/ai-maestro | Clawdis | opcode | agent-relay |
|---------|---------------------|---------------------|---------|--------|-------------|
| **Type** | Desktop (Electron) | Web (Next.js) | Assistant (Node) | Desktop (Tauri) | CLI (Node.js) |
| **Agent A2A** | No (moderator) | Yes (file+tmux) | No (single agent) | No (single user) | Yes (pattern) |
| **Distributed** | No | Yes | Yes (node pairing) | No | No |
| **Automation** | Playbooks | No | Cron jobs | CC Agents | No |
| **Session Resume** | Yes | No | Yes | Yes (full GUI) | No |
| **Checkpoints** | No | No | No | Yes (timeline) | No |
| **Multi-Surface** | No | No | Yes | No | No |
| **Idempotency** | No | No | Yes | No | No |
| **Usage Analytics** | No | No | No | Yes | No |
| **Setup** | High | Medium | Medium | Medium | Low |
| **Latency** | ~100ms | ~500ms | ~100ms | N/A (GUI) | <5ms |

---

## What agent-relay Should Adopt

### Tier 1: High Value, Low Effort

| Feature | Source | Why | Implementation |
|---------|--------|-----|----------------|
| **Message Priority** | 23blocks | Urgent messages shouldn't wait | `->relay:Bob [urgent] message` |
| **Message Types** | 23blocks | Distinguish request vs notification | `->relay:Bob [type:request] message` |
| **Read/Unread Tracking** | 23blocks | Don't re-show seen messages | Add `read` flag to SQLite |
| **Idempotency Keys** | Clawdis | Prevent duplicate sends on reconnect | TTL cache (5min, 1000 entries) |

### Tier 2: High Value, Medium Effort

| Feature | Source | Why | Implementation |
|---------|--------|-----|----------------|
| **Session Resume** | Maestro | Continue past conversations | Track session IDs, `agent-relay resume <id>` |
| **Simple Autorun** | Maestro | Batch process task lists | `agent-relay autorun tasks.md` |
| **Agent Metadata** | All three | Know what each agent does | Store program, model, capabilities |

### Tier 3: Future Considerations

| Feature | Source | Why | Effort |
|---------|--------|-----|--------|
| **Multi-Surface Delivery** | Clawdis | Slack/Discord integration | High |
| **Node Pairing** | Clawdis | Distributed instances | High |
| **Moderator Mode** | Maestro | AI-synthesized group responses | High |

---

## Proposed Enhanced Pattern Syntax

```bash
# Current (unchanged, backwards compatible)
->relay:Bob message

# Priority levels
->relay:Bob [urgent] Fix production NOW
->relay:Bob [high] Please review PR
->relay:Bob [normal] FYI - tests passing
->relay:Bob [low] Nice to have

# Message types
->relay:Bob [type:request] Can you review?
->relay:Bob [type:response] Done, approved
->relay:Bob [type:notification] Build complete
->relay:Bob [type:update] Progress: 50%

# Combined
->relay:Bob [urgent] [type:request] CRITICAL: Fix auth bug

# Reply reference
->relay:Bob [ref:abc123] Here's the fix you requested
```

**Parsing:**
```typescript
const RELAY_PATTERN = /^->relay:(\S+)\s*(\[[\w:]+\]\s*)*(.+)$/;
```

---

## Implementation Roadmap

### Phase 1: Message Enhancements (Week 1-2)
- [ ] Parse priority: `[urgent|high|normal|low]`
- [ ] Parse type: `[type:request|response|notification|update]`
- [ ] Add `read` column to messages table
- [ ] Implement idempotency cache (5min TTL, 1000 cap)

### Phase 2: Session Management (Week 3-4)
- [ ] Track session IDs per agent
- [ ] Add `agent-relay resume <session>` command
- [ ] Add `agent-relay sessions` list command

### Phase 3: Simple Automation (Week 5-6)
- [ ] Parse markdown checklists
- [ ] `agent-relay autorun tasks.md`
- [ ] Fresh context per task option

---

## Final Positioning

| Use Case | Best Tool |
|----------|-----------|
| **Quick local coordination** | agent-relay |
| **Long autonomous sessions** | pedramamini/Maestro |
| **Distributed team agents** | 23blocks/ai-maestro |
| **Personal multi-device assistant** | Clawdis |
| **Minimal dependencies** | agent-relay |
| **Code intelligence** | 23blocks/ai-maestro |

**agent-relay's niche:** Fast, simple, direct agent-to-agent messaging with universal agent support.

**Key differentiator to maintain:** <5ms latency + zero-config pattern detection.

**Key features to add:** Message metadata, idempotency, session resume.

---

## Sources

### steipete/Clawdis
- [Clawdis GitHub Repository](https://github.com/steipete/clawdis)
- [Clawdis Documentation](https://clawdis.ai/)

---

---

# Part 5: winfunc/opcode

## Executive Summary

| Aspect | opcode | agent-relay |
|--------|--------|-------------|
| **Type** | Desktop GUI (Tauri/Rust) | CLI Tool (Node.js) |
| **Purpose** | Claude Code session manager | Agent-to-agent messaging |
| **Architecture** | React + Rust + SQLite | PTY wrapper + Unix socket daemon |
| **Agent Model** | CC Agents (background processes) | Wrapped CLI agents |
| **Communication** | No A2A - single user interface | Direct peer-to-peer |
| **Key Feature** | Timeline checkpoints | Real-time messaging |
| **Complexity** | ~15,000+ lines Rust/TypeScript | ~7,000 lines TypeScript |

**Note:** opcode is NOT an agent orchestration tool like the others. It's a **GUI for Claude Code** that manages sessions, creates custom agents, and tracks usage. However, it has interesting features worth analyzing.

---

## Architecture Deep Dive

### opcode: Tauri Desktop App

```
┌─────────────────────────────────────────────────────────────────────┐
│                    opcode Desktop Application                        │
│                         (Tauri 2 / Rust)                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              React 18 Frontend (TypeScript + Vite)              │ │
│  │  ├─ Project browser (~/.claude/projects/)                      │ │
│  │  ├─ Session history viewer                                     │ │
│  │  ├─ CC Agents manager                                          │ │
│  │  ├─ Usage analytics dashboard                                  │ │
│  │  ├─ MCP server registry                                        │ │
│  │  └─ CLAUDE.md editor                                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │ Tauri IPC                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Rust Backend                                       │ │
│  │  ├─ ProcessRegistry (agent/session tracking)                   │ │
│  │  ├─ CheckpointManager (timeline snapshots)                     │ │
│  │  ├─ ClaudeBinary (CLI discovery + invocation)                  │ │
│  │  └─ SQLite storage (rusqlite)                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Claude Code CLI       │     │   CC Agent Process      │
│   (interactive session) │     │   (background task)     │
│   - Resume/new session  │     │   - Custom system prompt│
│   - Project context     │     │   - Isolated execution  │
│   - Full terminal       │     │   - Execution logs      │
└─────────────────────────┘     └─────────────────────────┘
```

---

## Key Features

### 1. CC Agents System

**Definition Format (.opcode.json):**
```json
{
  "name": "Security Scanner",
  "icon": "shield",
  "model": "opus",
  "system_prompt": "You are a security expert...",
  "default_task": "Perform SAST analysis",
  "version": "1.0.0"
}
```

**Pre-built Agents:**
| Agent | Model | Purpose |
|-------|-------|---------|
| Git Commit Bot | Sonnet | Generate conventional commit messages |
| Security Scanner | Opus | SAST, OWASP Top 10, threat modeling |
| Unit Tests Bot | Opus | Generate tests with 80%+ coverage |

**Execution Model:**
- Agents run in **isolated background processes**
- No blocking of main UI
- Execution logs with performance metrics
- Per-agent permission controls (file access, network)

### 2. Timeline & Checkpoints

```
┌─────────────────────────────────────────────────────────────────┐
│                    Session Timeline                              │
│                                                                  │
│  ┌───┐     ┌───┐     ┌───┐     ┌───┐     ┌───┐                 │
│  │ 1 │────▶│ 2 │────▶│ 3 │────▶│ 4 │────▶│ 5 │  (main branch) │
│  └───┘     └───┘     └─┬─┘     └───┘     └───┘                 │
│                        │                                        │
│                        └──▶┌───┐                               │
│                            │3a │  (fork from checkpoint 3)     │
│                            └───┘                               │
└─────────────────────────────────────────────────────────────────┘
```

**Checkpoint Manager Features:**
- **File State Tracking** - Hash-based modification detection
- **Auto-Checkpoint Modes:**
  - Manual (user-triggered)
  - PerPrompt (after each user message)
  - PerToolUse (after each tool call)
  - Smart (after destructive ops: write, edit, bash)
- **Restoration** - Delete/restore files to match checkpoint state
- **Fork Sessions** - Branch from any checkpoint with diff viewing

### 3. Claude Binary Discovery

**Priority-based discovery:**
```
1. Database (previously stored path)
2. which/where command (highest priority)
3. Homebrew
4. System paths
5. NVM directories
6. Package managers (yarn, bun, npm)
```

**Version comparison:** Selects highest semantic version. Prepends NVM/Homebrew bin to PATH dynamically.

### 4. Process Registry

**ProcessType:**
- `Agent(agent_id, agent_name)` - CC Agent runs
- `ClaudeSession(session_id)` - Interactive sessions

**Lifecycle Management:**
```rust
// Graceful shutdown sequence
1. Direct kill signal
2. System command fallback (taskkill/kill)
3. 5-second timeout
4. Force termination (SIGKILL)
```

**Thread Safety:** Arc<Mutex<>> for concurrent access across async Tokio operations.

---

## Comparison with agent-relay

| Feature | opcode | agent-relay |
|---------|--------|-------------|
| **Primary Purpose** | Claude Code GUI | Agent messaging |
| **Agent-to-Agent** | No | Yes |
| **Session Management** | Full (browse, resume, fork) | None |
| **Checkpoints/Timeline** | Yes (file snapshots) | No |
| **Usage Analytics** | Yes (cost, tokens, models) | No |
| **MCP Integration** | Yes (server registry) | No |
| **Process Isolation** | Yes (per-agent) | Yes (per-agent) |
| **Background Agents** | Yes (CC Agents) | Yes (tmux sessions) |
| **Custom System Prompts** | Yes (.opcode.json) | No |
| **Technology** | Rust + React | Node.js |

---

## Key Insights from opcode

### What It Does That agent-relay Doesn't

1. **Timeline/Checkpoint System**
   - Snapshot session state at any point
   - Fork from checkpoints
   - Diff between versions
   - File-level state restoration

2. **CC Agents with Custom Prompts**
   - Define reusable agent templates
   - System prompt per agent type
   - Model selection (Opus/Sonnet/Haiku)
   - Import/export agent definitions

3. **Usage Analytics**
   - Token consumption tracking
   - Cost monitoring per model/project
   - Export for reporting

4. **MCP Server Management**
   - Central registry for Model Context Protocol servers
   - Connection verification
   - Import from Claude Desktop config

5. **Session Discovery**
   - Auto-detect projects in `~/.claude/projects/`
   - Browse session history
   - Resume any past session

### What agent-relay Does That opcode Doesn't

1. **Agent-to-Agent Messaging** - opcode has NO A2A communication
2. **Multi-Agent Coordination** - opcode is single-user focused
3. **Real-time Broadcasting** - No `->relay:*` equivalent
4. **Universal Agent Support** - opcode is Claude-only

---

## Adoptable Ideas for agent-relay

### From opcode

| Priority | Feature | Why | Effort |
|----------|---------|-----|--------|
| P2 | Session checkpoints | Snapshot agent state, rollback if needed | High |
| P2 | Custom agent templates | Reusable agent configs with system prompts | Medium |
| P3 | Usage analytics | Track token usage across agents | Medium |
| P3 | Agent definition files | `.agent-relay.json` for agent metadata | Low |

### Proposed Agent Template Format

```json
{
  "name": "CodeReviewer",
  "cli": "claude",
  "model": "sonnet",
  "system_prompt": "You are a code reviewer focused on security...",
  "default_task": "Review PR for security issues",
  "permissions": {
    "file_read": true,
    "file_write": false,
    "network": false
  }
}
```

**Usage:**
```bash
agent-relay -n CodeReviewer --template code-reviewer.json claude
```

---

## Different Use Cases

| Scenario | Best Tool |
|----------|-----------|
| **Managing Claude Code sessions** | opcode |
| **Agent-to-agent coordination** | agent-relay |
| **Custom background agents (single user)** | opcode |
| **Multi-agent collaboration** | agent-relay |
| **Usage analytics & cost tracking** | opcode |
| **Real-time agent messaging** | agent-relay |

**Key Insight:** opcode and agent-relay are **complementary**, not competitive. opcode manages Claude Code sessions for a single user; agent-relay enables multiple agents to communicate.

---

## Sources

- [opcode GitHub Repository](https://github.com/winfunc/opcode)
- [opcode Website](https://opcode.sh/)
- [opcode CC Agents](https://github.com/winfunc/opcode/tree/main/cc_agents)

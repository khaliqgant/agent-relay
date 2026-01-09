# Inspiration & Attribution

This document acknowledges projects and ideas that have inspired features in agent-relay.

---

## Core Messaging Inspirations

### mcp_agent_mail

**Repository:** https://github.com/Dicklesworthstone/mcp_agent_mail

A brilliant MCP-based approach to agent messaging with file-based inboxes and structured message handling.

**Features Inspired:**
- Durable, asynchronous agent communication patterns
- File-based message persistence model
- Structured message handling with typed payloads

### swarm-tools / swarm-mail

**Repository:** https://github.com/joelhooks/swarm-tools

An exceptional event-sourced coordination system with durable cursors, locks, deferred responses, and ask/respond patterns.

**Features Inspired:**
- Event-sourced message history
- Durable cursors for message consumption
- Ask/respond patterns for synchronous-style communication over async
- Lock mechanisms for coordination
- Full audit trails for debugging

---

## Context & Memory Inspirations

### Continuous-Claude-v2

**Repository:** https://github.com/parcadei/Continuous-Claude-v2

Key insight: "Clear don't compact, save state to ledger."

**Features Inspired:**
- `src/resiliency/context-persistence.ts` - Ledger-based state storage
- Context persistence across restarts
- Provider-specific context injection (Claude hooks, Codex config, Gemini instructions)

### claude-mem

**Repository:** https://github.com/thedotmack/claude-mem

A persistent memory system for Claude Code that captures tool usage and observations.

**Features Inspired:**
- Tool observation recording patterns
- Semantic concept extraction
- Session-based memory organization

---

## Orchestration Inspirations

### ai-maestro

Referenced for its manager/worker orchestration patterns.

**Features Inspired:**
- Hierarchical agent naming conventions
- Color coding for agent visualization
- Control plane API design (REST + WebSocket)
- Manager/worker delegation patterns

### Claude-Flow

Referenced for work distribution patterns.

**Features Inspired:**
- Work stealing coordinator pattern for load balancing
- Idle agent task claiming from overloaded peers
- Task queue visibility and agent load metrics

---

## Task Management Inspirations

### beads

**Repository:** https://github.com/steveyegge/beads

A lightweight, dependency-aware issue database with CLI for selecting "ready work."

**Features Inspired:**
- Priority-based task selection
- Dependency tracking between tasks
- "Ready work" concept for agent assignment
- Issue database patterns (`.beads/` directory structure)

### agent-trajectories

**Repository:** https://github.com/steveyegge/agent-trajectories

Decision tracking system for understanding agent reasoning.

**Features Inspired:**
- Trail CLI for recording work trajectories
- Decision logging with reasoning
- Confidence levels on completed work
- Cross-session learning from past decisions

---

## Performance & Reliability Inspirations

### russian-code-ts

**Repository:** https://codeberg.org/GrigoryEvko/russian-code-ts

A community-driven reimplementation of Claude Code CLI that provided inspiration for several performance and reliability features.

| Feature | Inspiration | Our Implementation |
|---------|-------------|-------------------|
| **Precompiled Regex Patterns** | Their <1ms performance targets for permission matching | `src/utils/precompiled-patterns.ts` - Combined instructional markers into single regex, module-level caching |
| **Agent Authentication** | Their planned agent identity verification system | `src/daemon/agent-signing.ts` - HMAC-SHA256 signing with key rotation support |
| **Dead Letter Queue** | Their reliability patterns for message handling | `src/storage/dlq-adapter.ts` - Adapter pattern for SQLite/PostgreSQL/In-memory |
| **Context Compaction** | Their context window management approach | `src/memory/context-compaction.ts` - Token estimation and importance-weighted retention |
| **Consensus Mechanism** | Their planned agent swarm coordination features | `src/daemon/consensus.ts` - Multiple voting strategies for agent decision-making |

**Key Technical Insights:**

1. **Performance Optimization**: Pre-compiling regex patterns at module load time rather than per-call dramatically improves throughput for high-frequency operations like message routing.

2. **Storage Abstraction**: Using adapter patterns allows the same code to run in local development (SQLite) and cloud production (PostgreSQL) without modification.

3. **Agent Identity**: As agent systems scale, cryptographic identity verification becomes essential for trust in multi-agent environments.

4. **Context Management**: Token-aware context compaction is critical for long-running agent sessions to maintain coherent conversations.

---

## Tools & Testing Inspirations

### agent-tools

**Repository:** https://github.com/badlogic/agent-tools

Browser automation toolkit for agent testing.

**Features Inspired:**
- Browser testing skill (`browser-testing-with-screenshots`)
- Screenshot capture for visual verification
- Chrome automation patterns

---

## Competitive Analysis

We've also studied these projects to understand the landscape:

- **[Tmux-Orchestrator](https://github.com/Jedward23/Tmux-Orchestrator)** - Alternative tmux-based agent coordination
- **[Gastown](https://github.com/steveyegge/gastown)** - Agent workflow patterns
- **[Happy Coder](https://github.com/slopus/happy)** - AI coding assistant patterns
- **[OpenCode](https://github.com/anomalyco/opencode)** - Headless mode integration patterns

---

## Contributing

If you've drawn inspiration from other projects for features you're contributing, please add them to this document with:

- Project name and link
- What feature(s) were inspired
- What specific insights were gained

Proper attribution helps maintain a collaborative open source ecosystem.

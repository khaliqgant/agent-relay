# Slack Bot Integration Proposal

**Author:** Claude
**Date:** 2025-12-30
**Status:** Draft
**Estimated Effort:** 3-5 days

---

## Executive Summary

This proposal outlines a plan to integrate agent-relay messaging with Slack, enabling:
- AI agents to communicate in Slack channels alongside humans
- Humans to interact with agents via @mentions and slash commands
- Real-time bidirectional sync between relay daemon and Slack
- Thread preservation across both systems

The integration leverages agent-relay's existing architecture (pluggable storage, event-driven routing, session management) to create a **Slack Bridge** component that acts as a first-class agent in the relay network.

---

## Table of Contents

1. [Goals & Non-Goals](#1-goals--non-goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Design](#3-component-design)
4. [Protocol Mapping](#4-protocol-mapping)
5. [Implementation Phases](#5-implementation-phases)
6. [API Specifications](#6-api-specifications)
7. [Security Considerations](#7-security-considerations)
8. [Configuration](#8-configuration)
9. [User Experience](#9-user-experience)
10. [Testing Strategy](#10-testing-strategy)
11. [Open Questions](#11-open-questions)
12. [Appendix](#appendix)

---

## 1. Goals & Non-Goals

### Goals

| Goal | Description |
|------|-------------|
| **Bidirectional messaging** | Messages flow Slack ↔ Relay in real-time |
| **Agent identity in Slack** | Each agent appears as a distinct bot user or uses display name |
| **Thread preservation** | Relay threads map to Slack threads and vice versa |
| **Human-agent interaction** | Humans can @mention agents and receive responses |
| **Channel organization** | Broadcasts go to configured channels, DMs to relay direct messages |
| **Message history** | Slack serves as additional persistence layer with search |
| **Minimal latency** | Sub-second message delivery in both directions |
| **Graceful degradation** | Relay continues working if Slack is unavailable |

### Non-Goals (v1)

| Non-Goal | Rationale |
|----------|-----------|
| Multi-workspace support | Complexity; can add in v2 |
| Slack-only agents | Agents should exist in relay first |
| Rich message formatting | Plain text first; Block Kit later |
| File/image transfer | Focus on text messaging |
| Reactions as signals | Nice-to-have for v2 |
| Voice/Huddles | Out of scope |

---

## 2. Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SLACK WORKSPACE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ #agents     │  │ #alerts     │  │ @Alice-bot  │  │ @Bob-bot    │        │
│  │ (broadcast) │  │ (topic)     │  │ (DM)        │  │ (DM)        │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                    │                                        │
│                              Slack Events API                               │
│                              (Socket Mode)                                  │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           SLACK BRIDGE SERVICE                              │
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│  │  Slack Listener  │    │  Message Router  │    │  Agent Registry  │     │
│  │                  │    │                  │    │                  │     │
│  │  • app_mention   │───▶│  • Slack→Relay   │    │  • name→botId    │     │
│  │  • message       │    │  • Relay→Slack   │    │  • botId→name    │     │
│  │  • thread_reply  │    │  • Thread map    │    │  • channel config│     │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────┘     │
│                                   │                                        │
│  ┌──────────────────┐    ┌────────▼─────────┐    ┌──────────────────┐     │
│  │  Slack Sender    │    │  Relay Client    │    │  Thread Store    │     │
│  │                  │◀───│                  │    │                  │     │
│  │  • chat.post     │    │  • HELLO/WELCOME │    │  • relay↔slack   │     │
│  │  • chat.update   │    │  • SEND/DELIVER  │    │  • ts mapping    │     │
│  │  • threads       │    │  • Subscribe '*' │    │  • expiration    │     │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘     │
│                                                                             │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                   Unix Domain Socket
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RELAY DAEMON                                      │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Alice     │  │    Bob      │  │  SlackBridge│  │  Dashboard  │        │
│  │  (Claude)   │  │  (Claude)   │  │  (special)  │  │  (observer) │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  Router: routes messages, tracks subscriptions, manages shadows              │
│  Storage: SQLite persistence for all messages                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Examples

#### Flow 1: Agent → Slack Channel (Broadcast)

```
1. Alice outputs: ->relay:* <<<STATUS: Starting auth refactor>>>
2. Relay daemon receives SEND envelope, routes to all agents
3. SlackBridge receives DELIVER envelope (subscribed to '*')
4. SlackBridge.onRelayMessage() triggered
5. Maps broadcast → configured #agents channel
6. Calls slack.chat.postMessage({ channel: '#agents', text: '...' })
7. Slack displays: "[Alice] STATUS: Starting auth refactor"
```

#### Flow 2: Human → Agent (Slack Mention)

```
1. Human types in Slack: "@Alice-bot can you review PR #42?"
2. Slack Events API sends app_mention event to SlackBridge
3. SlackBridge.onSlackMention() triggered
4. Maps @Alice-bot → agent name "Alice"
5. Creates SEND envelope: { to: 'Alice', body: 'can you review PR #42?' }
6. Sends via RelayClient to daemon
7. Daemon routes DELIVER to Alice's terminal
8. Alice sees: "Relay message from slack:@human [abc123]: can you review PR #42?"
9. Alice responds: ->relay:slack:@human <<<I'll review PR #42 now>>>
10. SlackBridge receives, posts reply in same thread
```

#### Flow 3: Agent → Agent (Visible in Slack)

```
1. Alice: ->relay:Bob <<<Can you handle the API tests?>>>
2. Daemon routes to Bob AND SlackBridge (shadow mode)
3. SlackBridge posts to #agents: "[Alice → Bob] Can you handle the API tests?"
4. Bob responds: ->relay:Alice <<<On it>>>
5. SlackBridge posts: "[Bob → Alice] On it"
6. Humans can follow agent coordination in real-time
```

---

## 3. Component Design

### 3.1 SlackBridgeService

Main orchestration class that coordinates all Slack integration.

```typescript
// src/slack/slack-bridge-service.ts

import { App, LogLevel } from '@slack/bolt';
import { RelayClient } from '../wrapper/client';
import { SlackAgentRegistry } from './agent-registry';
import { SlackThreadStore } from './thread-store';
import { SlackMessageFormatter } from './formatter';

export interface SlackBridgeConfig {
  // Slack credentials
  slackBotToken: string;
  slackAppToken: string;      // For Socket Mode
  slackSigningSecret: string;

  // Relay connection
  relaySocketPath?: string;   // Default: /tmp/agent-relay.sock
  bridgeAgentName?: string;   // Default: 'SlackBridge'

  // Channel configuration
  broadcastChannel: string;   // Channel for ->relay:* messages
  alertsChannel?: string;     // Channel for high-importance messages

  // Agent mapping
  agentBotMapping?: Record<string, string>;  // agentName → Slack bot user ID
  defaultBotId?: string;      // Fallback bot for unknown agents

  // Behavior
  showAgentToAgent?: boolean; // Show agent↔agent messages in Slack (default: true)
  threadTTLMs?: number;       // Thread mapping expiration (default: 24h)
  messagePrefix?: string;     // Prefix for relay messages (default: '')
}

export class SlackBridgeService {
  private slackApp: App;
  private relayClient: RelayClient;
  private agentRegistry: SlackAgentRegistry;
  private threadStore: SlackThreadStore;
  private formatter: SlackMessageFormatter;
  private config: SlackBridgeConfig;

  constructor(config: SlackBridgeConfig) {
    this.config = config;
    this.agentRegistry = new SlackAgentRegistry(config.agentBotMapping);
    this.threadStore = new SlackThreadStore(config.threadTTLMs);
    this.formatter = new SlackMessageFormatter(config.messagePrefix);
  }

  async start(): Promise<void> {
    // 1. Initialize Slack App (Socket Mode for real-time events)
    this.slackApp = new App({
      token: this.config.slackBotToken,
      appToken: this.config.slackAppToken,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });

    // 2. Register Slack event handlers
    this.registerSlackHandlers();

    // 3. Connect to relay daemon
    this.relayClient = new RelayClient({
      socketPath: this.config.relaySocketPath,
      agentName: this.config.bridgeAgentName || 'SlackBridge',
      cli: 'slack',
      reconnect: true,
    });

    this.relayClient.onMessage = this.onRelayMessage.bind(this);
    this.relayClient.onStateChange = this.onRelayStateChange.bind(this);

    await this.relayClient.connect();

    // 4. Subscribe to all messages (broadcast listener)
    this.relayClient.subscribe('*');

    // 5. Start Slack app
    await this.slackApp.start();

    console.log('SlackBridge started successfully');
  }

  async stop(): Promise<void> {
    await this.slackApp.stop();
    await this.relayClient.disconnect();
  }

  // ─────────────────────────────────────────────────────────────
  // Slack → Relay
  // ─────────────────────────────────────────────────────────────

  private registerSlackHandlers(): void {
    // Handle @mentions of agent bots
    this.slackApp.event('app_mention', async ({ event, say }) => {
      await this.handleSlackMention(event, say);
    });

    // Handle direct messages to bot
    this.slackApp.event('message', async ({ event, say }) => {
      if (event.channel_type === 'im') {
        await this.handleSlackDM(event, say);
      }
    });

    // Handle slash command: /relay @agent message
    this.slackApp.command('/relay', async ({ command, ack, respond }) => {
      await ack();
      await this.handleSlashCommand(command, respond);
    });

    // Handle thread replies (for conversation continuity)
    this.slackApp.event('message', async ({ event }) => {
      if (event.thread_ts && event.thread_ts !== event.ts) {
        await this.handleThreadReply(event);
      }
    });
  }

  private async handleSlackMention(event: any, say: Function): Promise<void> {
    // Extract target agent from the bot that was mentioned
    const mentionedBotId = this.extractBotMention(event.text);
    const agentName = this.agentRegistry.getAgentName(mentionedBotId);

    if (!agentName) {
      await say({ text: `Unknown agent. Available: ${this.agentRegistry.listAgents().join(', ')}`, thread_ts: event.ts });
      return;
    }

    // Clean message text (remove bot mention)
    const cleanText = this.cleanMentionText(event.text, mentionedBotId);

    // Create relay message
    const slackUser = await this.resolveSlackUser(event.user);
    const thread = this.threadStore.getOrCreateThread(event.thread_ts || event.ts, event.channel);

    // Send to relay
    this.relayClient.sendMessage(
      agentName,
      cleanText,
      'message',
      {
        slack_user: slackUser,
        slack_channel: event.channel,
        slack_ts: event.ts,
        slack_thread_ts: event.thread_ts,
      },
      thread
    );
  }

  private async handleSlackDM(event: any, say: Function): Promise<void> {
    // DMs go to a default agent or specified via config
    const targetAgent = this.config.defaultBotId
      ? this.agentRegistry.getAgentName(this.config.defaultBotId)
      : this.agentRegistry.listAgents()[0];

    if (!targetAgent) {
      await say('No agents available');
      return;
    }

    const slackUser = await this.resolveSlackUser(event.user);

    this.relayClient.sendMessage(
      targetAgent,
      event.text,
      'message',
      {
        slack_user: slackUser,
        slack_channel: event.channel,
        slack_ts: event.ts,
        slack_dm: true,
      }
    );
  }

  private async handleSlashCommand(command: any, respond: Function): Promise<void> {
    // Parse: /relay @AgentName message body
    const match = command.text.match(/^@?(\w+)\s+(.+)$/s);

    if (!match) {
      await respond('Usage: /relay @AgentName your message here');
      return;
    }

    const [, agentName, messageBody] = match;
    const slackUser = await this.resolveSlackUser(command.user_id);

    this.relayClient.sendMessage(
      agentName,
      messageBody,
      'message',
      {
        slack_user: slackUser,
        slack_channel: command.channel_id,
        slack_command: true,
      }
    );

    await respond(`Message sent to ${agentName}`);
  }

  private async handleThreadReply(event: any): Promise<void> {
    // Check if this thread is mapped to a relay thread
    const relayThread = this.threadStore.getRelayThread(event.thread_ts, event.channel);

    if (!relayThread) {
      return; // Not a relay-related thread
    }

    // Forward reply to the relay thread
    const slackUser = await this.resolveSlackUser(event.user);

    // Determine target (original recipient of thread)
    const threadMeta = this.threadStore.getThreadMeta(event.thread_ts, event.channel);

    this.relayClient.sendMessage(
      threadMeta?.targetAgent || '*',
      event.text,
      'message',
      {
        slack_user: slackUser,
        slack_thread_ts: event.thread_ts,
      },
      relayThread
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Relay → Slack
  // ─────────────────────────────────────────────────────────────

  private async onRelayMessage(
    from: string,
    payload: { kind: string; body: string; data?: Record<string, unknown>; thread?: string },
    messageId: string,
    meta?: { importance?: number }
  ): Promise<void> {
    // Skip messages from SlackBridge itself (prevent echo)
    if (from === this.config.bridgeAgentName) {
      return;
    }

    // Skip if this originated from Slack (prevent loop)
    if (payload.data?.slack_ts) {
      return;
    }

    const formatted = this.formatter.formatRelayMessage(from, payload);

    // Determine target channel
    let channel: string;
    let threadTs: string | undefined;

    if (payload.data?.to === '*') {
      // Broadcast → broadcast channel
      channel = this.config.broadcastChannel;
    } else if (payload.data?.slack_channel) {
      // Reply to Slack message → same channel/thread
      channel = payload.data.slack_channel as string;
      threadTs = payload.data.slack_thread_ts as string;
    } else if (meta?.importance && meta.importance >= 80 && this.config.alertsChannel) {
      // High importance → alerts channel
      channel = this.config.alertsChannel;
    } else {
      // Default → broadcast channel
      channel = this.config.broadcastChannel;
    }

    // Handle relay thread → Slack thread mapping
    if (payload.thread) {
      const slackThread = this.threadStore.getSlackThread(payload.thread);
      if (slackThread) {
        threadTs = slackThread.ts;
        channel = slackThread.channel;
      }
    }

    // Post to Slack
    const result = await this.slackApp.client.chat.postMessage({
      channel,
      text: formatted.text,
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
    });

    // Store thread mapping for replies
    if (result.ts && payload.thread) {
      this.threadStore.mapThread(payload.thread, {
        ts: result.ts,
        channel,
        targetAgent: from,
      });
    }
  }

  private onRelayStateChange(state: string): void {
    console.log(`SlackBridge relay connection: ${state}`);

    if (state === 'DISCONNECTED') {
      // Could post to alertsChannel about disconnection
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private extractBotMention(text: string): string | null {
    const match = text.match(/<@([A-Z0-9]+)>/);
    return match ? match[1] : null;
  }

  private cleanMentionText(text: string, botId: string): string {
    return text.replace(new RegExp(`<@${botId}>\\s*`, 'g'), '').trim();
  }

  private async resolveSlackUser(userId: string): Promise<string> {
    try {
      const result = await this.slackApp.client.users.info({ user: userId });
      return result.user?.real_name || result.user?.name || userId;
    } catch {
      return userId;
    }
  }
}
```

### 3.2 SlackAgentRegistry

Maps agent names to Slack bot identities.

```typescript
// src/slack/agent-registry.ts

export interface AgentMapping {
  agentName: string;
  slackBotId: string;
  slackBotName?: string;
  channels?: string[];  // Channels this agent posts to
}

export class SlackAgentRegistry {
  private agentToBot: Map<string, string> = new Map();
  private botToAgent: Map<string, string> = new Map();

  constructor(initialMapping?: Record<string, string>) {
    if (initialMapping) {
      for (const [agent, botId] of Object.entries(initialMapping)) {
        this.register(agent, botId);
      }
    }
  }

  register(agentName: string, slackBotId: string): void {
    this.agentToBot.set(agentName, slackBotId);
    this.botToAgent.set(slackBotId, agentName);
  }

  unregister(agentName: string): void {
    const botId = this.agentToBot.get(agentName);
    if (botId) {
      this.botToAgent.delete(botId);
    }
    this.agentToBot.delete(agentName);
  }

  getSlackBotId(agentName: string): string | undefined {
    return this.agentToBot.get(agentName);
  }

  getAgentName(slackBotId: string): string | undefined {
    return this.botToAgent.get(slackBotId);
  }

  listAgents(): string[] {
    return Array.from(this.agentToBot.keys());
  }

  listBots(): string[] {
    return Array.from(this.botToAgent.keys());
  }
}
```

### 3.3 SlackThreadStore

Manages bidirectional thread mapping between Relay and Slack.

```typescript
// src/slack/thread-store.ts

export interface SlackThreadRef {
  ts: string;           // Slack thread_ts
  channel: string;      // Slack channel ID
  targetAgent?: string; // Agent this thread is primarily with
  createdAt: number;
}

export interface RelayThreadRef {
  threadId: string;     // Relay thread ID
  createdAt: number;
}

export class SlackThreadStore {
  private relayToSlack: Map<string, SlackThreadRef> = new Map();
  private slackToRelay: Map<string, RelayThreadRef> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {  // 24 hours default
    this.ttlMs = ttlMs;

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60 * 60 * 1000);  // Every hour
  }

  mapThread(relayThreadId: string, slackRef: Omit<SlackThreadRef, 'createdAt'>): void {
    const now = Date.now();
    const slackKey = this.slackKey(slackRef.ts, slackRef.channel);

    this.relayToSlack.set(relayThreadId, { ...slackRef, createdAt: now });
    this.slackToRelay.set(slackKey, { threadId: relayThreadId, createdAt: now });
  }

  getSlackThread(relayThreadId: string): SlackThreadRef | undefined {
    return this.relayToSlack.get(relayThreadId);
  }

  getRelayThread(slackTs: string, channel: string): string | undefined {
    const ref = this.slackToRelay.get(this.slackKey(slackTs, channel));
    return ref?.threadId;
  }

  getOrCreateThread(slackTs: string, channel: string): string {
    const existing = this.getRelayThread(slackTs, channel);
    if (existing) return existing;

    // Create new relay thread ID
    const relayThreadId = `slack-${channel}-${slackTs}`;
    this.mapThread(relayThreadId, { ts: slackTs, channel });
    return relayThreadId;
  }

  getThreadMeta(slackTs: string, channel: string): SlackThreadRef | undefined {
    const relayId = this.getRelayThread(slackTs, channel);
    if (!relayId) return undefined;
    return this.relayToSlack.get(relayId);
  }

  private slackKey(ts: string, channel: string): string {
    return `${channel}:${ts}`;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.ttlMs;

    for (const [key, ref] of this.relayToSlack) {
      if (ref.createdAt < cutoff) {
        this.relayToSlack.delete(key);
      }
    }

    for (const [key, ref] of this.slackToRelay) {
      if (ref.createdAt < cutoff) {
        this.slackToRelay.delete(key);
      }
    }
  }
}
```

### 3.4 SlackMessageFormatter

Formats messages for display in Slack.

```typescript
// src/slack/formatter.ts

export interface FormattedSlackMessage {
  text: string;
  blocks?: any[];  // Slack Block Kit (future)
}

export class SlackMessageFormatter {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  formatRelayMessage(
    from: string,
    payload: { kind: string; body: string; data?: Record<string, unknown> }
  ): FormattedSlackMessage {
    const to = payload.data?.to as string;

    let header: string;
    if (to === '*') {
      header = `*[${from}]*`;  // Broadcast
    } else if (to) {
      header = `*[${from} → ${to}]*`;  // Direct message (visible)
    } else {
      header = `*[${from}]*`;
    }

    // Handle different message kinds
    let body = payload.body;
    if (payload.kind === 'thinking') {
      body = `_💭 ${body}_`;  // Italicize thinking
    } else if (payload.kind === 'action') {
      body = `\`${body}\``;  // Code format for actions
    }

    return {
      text: `${this.prefix}${header} ${body}`.trim(),
    };
  }

  formatSlackToRelay(
    slackUser: string,
    text: string,
    isDM: boolean = false
  ): string {
    if (isDM) {
      return `[DM from ${slackUser}]: ${text}`;
    }
    return `[${slackUser}]: ${text}`;
  }
}
```

---

## 4. Protocol Mapping

### 4.1 Message Type Mapping

| Relay Concept | Slack Equivalent | Notes |
|---------------|------------------|-------|
| `->relay:*` (broadcast) | Channel message to #agents | Configurable channel |
| `->relay:AgentName` | Not posted (unless shadowing) | Agent-to-agent stays internal |
| `->relay:slack:@user` | Reply in thread or DM | Special routing |
| Thread ID | `thread_ts` | Bidirectional mapping |
| `kind: 'message'` | Plain text | Standard |
| `kind: 'thinking'` | Italicized text | Optional visibility |
| `kind: 'action'` | Code-formatted text | Distinguishes actions |
| `importance: 80+` | Posts to #alerts | High-priority routing |
| ACK | Emoji reaction ✅ (optional) | Delivery confirmation |

### 4.2 Identity Mapping Options

**Option A: Single Bot, Multiple Display Names**
- One Slack app/bot
- Use `username` override in `chat.postMessage`
- Simpler setup, less realistic

**Option B: Multiple Bots (Recommended)**
- One Slack bot user per agent
- Requires multiple bot tokens or Enterprise Grid
- More realistic appearance

**Option C: Hybrid**
- Core agents get dedicated bots
- Spawned workers share a generic bot
- Balanced approach

### 4.3 Thread Synchronization

```
Relay Thread ID: "task-auth-review"
        │
        │  Thread Store
        ▼
Slack Thread: { channel: "C0123ABC", ts: "1234567890.123456" }

Mapping Rules:
1. First message creates mapping
2. Replies use existing thread_ts
3. Mapping expires after TTL (24h default)
4. Manual thread creation via /relay-thread command
```

---

## 5. Implementation Phases

### Phase 1: Core Bridge (Day 1-2)

**Deliverables:**
- [ ] `SlackBridgeService` with basic Slack connection
- [ ] `RelayClient` integration
- [ ] Relay → Slack broadcast posting
- [ ] Basic configuration loading

**Files:**
```
src/slack/
├── index.ts                  # Exports
├── slack-bridge-service.ts   # Main service
├── agent-registry.ts         # Agent mapping
└── formatter.ts              # Message formatting
```

**Test:**
```bash
# Start relay daemon
agent-relay up

# Start Slack bridge
agent-relay slack-bridge --config slack.config.json

# Send broadcast from agent
->relay:* <<<Hello from agent!>>>

# Verify appears in Slack #agents channel
```

### Phase 2: Slack → Relay (Day 2-3)

**Deliverables:**
- [ ] `app_mention` event handling
- [ ] `/relay` slash command
- [ ] DM handling
- [ ] User name resolution

**Test:**
```
# In Slack, mention an agent
@Alice-bot please review the auth code

# Verify Alice receives in terminal:
Relay message from slack:@JohnDoe [abc123]: please review the auth code
```

### Phase 3: Thread Synchronization (Day 3-4)

**Deliverables:**
- [ ] `SlackThreadStore` implementation
- [ ] Bidirectional thread mapping
- [ ] Thread reply handling
- [ ] Thread cleanup/expiration

**Test:**
```
# Agent starts a thread
->relay:Bob [thread:auth-review] <<<Starting auth review>>>

# Message appears in Slack with thread
# Human replies in Slack thread
# Reply reaches Bob with same thread context
```

### Phase 4: Polish & Configuration (Day 4-5)

**Deliverables:**
- [ ] Configuration file support
- [ ] CLI commands (`agent-relay slack-bridge`)
- [ ] Dashboard integration (show Slack bridge status)
- [ ] Error handling & reconnection
- [ ] Documentation

**Test:**
```bash
# Full integration test
agent-relay up --slack-bridge

# Multi-agent conversation visible in Slack
# Human interaction with agents
# Thread continuity
# Graceful disconnect/reconnect
```

---

## 6. API Specifications

### 6.1 Slack Bot Scopes Required

```yaml
OAuth Scopes:
  Bot Token Scopes:
    - app_mentions:read      # Receive @mentions
    - channels:history       # Read channel messages
    - channels:read          # List channels
    - chat:write             # Post messages
    - groups:history         # Read private channel messages (optional)
    - groups:read            # List private channels (optional)
    - im:history             # Read DMs
    - im:read                # List DMs
    - im:write               # Send DMs
    - users:read             # Get user info for display names

  Socket Mode: Enabled       # For real-time events
```

### 6.2 Configuration File Schema

```typescript
// slack.config.json
interface SlackBridgeConfigFile {
  slack: {
    botToken: string;        // xoxb-...
    appToken: string;        // xapp-...
    signingSecret: string;   // From Slack app settings
  };

  relay: {
    socketPath?: string;     // Default: /tmp/agent-relay.sock
    bridgeName?: string;     // Default: SlackBridge
  };

  channels: {
    broadcast: string;       // #agents
    alerts?: string;         // #agent-alerts
    directMessages?: boolean; // Allow DMs (default: true)
  };

  agents: {
    // Map agent names to Slack bot user IDs
    mapping: Record<string, string>;
    // Or use single bot with display name overrides
    singleBot?: boolean;
  };

  behavior: {
    showAgentToAgent?: boolean;  // Show inter-agent messages (default: true)
    showThinking?: boolean;      // Show thinking messages (default: false)
    threadTTLHours?: number;     // Thread mapping lifetime (default: 24)
    messagePrefix?: string;      // Prefix for all messages
  };
}
```

### 6.3 CLI Commands

```bash
# Start bridge with config file
agent-relay slack-bridge --config slack.config.json

# Start bridge with inline options
agent-relay slack-bridge \
  --slack-token xoxb-... \
  --app-token xapp-... \
  --channel agents

# Status check
agent-relay slack-bridge status

# Test connection
agent-relay slack-bridge test

# List agent mappings
agent-relay slack-bridge agents
```

### 6.4 REST API Additions (Dashboard)

```typescript
// GET /api/slack/status
interface SlackBridgeStatus {
  connected: boolean;
  workspace: string;
  channels: string[];
  agentMappings: Record<string, string>;
  messageStats: {
    relayToSlack: number;
    slackToRelay: number;
  };
  lastActivity?: string;
}

// POST /api/slack/send
interface SlackSendRequest {
  channel: string;
  text: string;
  thread_ts?: string;
}

// GET /api/slack/threads
interface SlackThreadList {
  threads: Array<{
    relayThread: string;
    slackChannel: string;
    slackTs: string;
    messageCount: number;
    lastActivity: string;
  }>;
}
```

---

## 7. Security Considerations

### 7.1 Authentication

| Risk | Mitigation |
|------|------------|
| Slack token exposure | Store in env vars or secrets manager, never in config files |
| Unauthorized relay access | Bridge uses same Unix socket permissions as other agents |
| Message spoofing | Validate Slack request signatures; use `slack_ts` deduplication |
| Bot impersonation | Each agent maps to exactly one bot ID |

### 7.2 Authorization

```typescript
// Optional: Restrict which Slack users can interact with agents
interface SlackAuthConfig {
  allowedUsers?: string[];      // Slack user IDs
  allowedChannels?: string[];   // Channel IDs
  adminUsers?: string[];        // Can use /relay-admin commands
}
```

### 7.3 Rate Limiting

```typescript
// Slack API limits
const SLACK_RATE_LIMITS = {
  chatPostMessage: 1,           // 1 per second per channel
  chatPostMessageBurst: 100,    // Burst allowance
  apiCallsPerMinute: 50,        // General tier 2 limit
};

// Implementation
class SlackRateLimiter {
  private channelTimestamps: Map<string, number[]> = new Map();

  async waitForSlot(channel: string): Promise<void> {
    // Implement token bucket or sliding window
  }
}
```

### 7.4 Data Privacy

- Messages are stored in both Relay SQLite and Slack (Slack retention policies apply)
- Consider: Should agent thinking messages be visible in Slack?
- Consider: PII in messages (user names, emails, etc.)

---

## 8. Configuration

### 8.1 Environment Variables

```bash
# Required
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# Optional
SLACK_BROADCAST_CHANNEL=agents
SLACK_ALERTS_CHANNEL=agent-alerts
RELAY_SOCKET_PATH=/tmp/agent-relay.sock
SLACK_BRIDGE_NAME=SlackBridge
```

### 8.2 Full Configuration Example

```json
{
  "slack": {
    "botToken": "${SLACK_BOT_TOKEN}",
    "appToken": "${SLACK_APP_TOKEN}",
    "signingSecret": "${SLACK_SIGNING_SECRET}"
  },
  "relay": {
    "socketPath": "/tmp/agent-relay.sock",
    "bridgeName": "SlackBridge"
  },
  "channels": {
    "broadcast": "C0123AGENTS",
    "alerts": "C0123ALERTS",
    "directMessages": true
  },
  "agents": {
    "mapping": {
      "Alice": "U0123ALICE",
      "Bob": "U0123BOB",
      "Coordinator": "U0123COORD"
    },
    "singleBot": false
  },
  "behavior": {
    "showAgentToAgent": true,
    "showThinking": false,
    "threadTTLHours": 24,
    "messagePrefix": ""
  }
}
```

---

## 9. User Experience

### 9.1 Slack Channel Setup

```
#agents (public)
├── All agent broadcasts
├── Agent-to-agent messages (if configured)
└── Thread conversations

#agent-alerts (private, optional)
├── High-importance messages
└── Error notifications

DMs
├── @Alice-bot → Direct conversation with Alice
└── @Coordinator-bot → Direct conversation with Coordinator
```

### 9.2 Message Appearance in Slack

```
#agents
─────────────────────────────────────────────────
[Alice] STATUS: Starting authentication refactor
    └── [Bob] I can help with the API tests
        └── [Alice] Thanks! Focus on /api/auth/*
─────────────────────────────────────────────────
[Coordinator] TASK COMPLETE: Auth refactor done
    ✅ Reviewed by: Bob, Alice
─────────────────────────────────────────────────
```

### 9.3 Human Interaction Patterns

**Pattern 1: Ask an Agent**
```
Human: @Alice-bot can you explain the auth flow?
Alice: [replies in thread with explanation]
```

**Pattern 2: Slash Command**
```
Human: /relay @Bob please run the test suite
Bot: Message sent to Bob
[Bob's response appears in #agents or thread]
```

**Pattern 3: Join a Conversation**
```
[Agent thread in progress]
Human: [replies in thread] I think we should use JWT instead
[Agents see human's message and can respond]
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// src/slack/__tests__/formatter.test.ts
describe('SlackMessageFormatter', () => {
  it('formats broadcast messages', () => {
    const formatter = new SlackMessageFormatter();
    const result = formatter.formatRelayMessage('Alice', {
      kind: 'message',
      body: 'Hello world',
      data: { to: '*' }
    });
    expect(result.text).toBe('*[Alice]* Hello world');
  });

  it('formats thinking messages with italics', () => {
    // ...
  });
});

// src/slack/__tests__/thread-store.test.ts
describe('SlackThreadStore', () => {
  it('maps relay threads to Slack threads', () => {
    // ...
  });

  it('expires old mappings', () => {
    // ...
  });
});
```

### 10.2 Integration Tests

```typescript
// src/slack/__tests__/integration.test.ts
describe('SlackBridgeService Integration', () => {
  let mockSlackApp: MockSlackApp;
  let mockRelayClient: MockRelayClient;
  let bridge: SlackBridgeService;

  beforeEach(async () => {
    mockSlackApp = new MockSlackApp();
    mockRelayClient = new MockRelayClient();
    bridge = new SlackBridgeService({ /* config */ });
  });

  it('forwards relay broadcasts to Slack', async () => {
    // Simulate relay message
    mockRelayClient.simulateMessage('Alice', { kind: 'message', body: 'Hello', data: { to: '*' } });

    // Verify Slack API called
    expect(mockSlackApp.postMessage).toHaveBeenCalledWith({
      channel: 'C0123AGENTS',
      text: '*[Alice]* Hello',
    });
  });

  it('forwards Slack mentions to relay', async () => {
    // Simulate Slack event
    mockSlackApp.simulateMention({ user: 'U123', text: '<@UALICE> help me', channel: 'C0123' });

    // Verify relay message sent
    expect(mockRelayClient.sendMessage).toHaveBeenCalledWith(
      'Alice',
      'help me',
      'message',
      expect.objectContaining({ slack_user: expect.any(String) })
    );
  });
});
```

### 10.3 End-to-End Test Script

```bash
#!/bin/bash
# scripts/test-slack-integration.sh

echo "Starting Slack integration test..."

# 1. Start daemon
agent-relay up &
DAEMON_PID=$!
sleep 2

# 2. Start Slack bridge
agent-relay slack-bridge --config test-slack.config.json &
BRIDGE_PID=$!
sleep 2

# 3. Start test agent
agent-relay -n TestAgent -- echo "Ready" &
AGENT_PID=$!
sleep 1

# 4. Send test broadcast
agent-relay send TestAgent --broadcast "Integration test message"

# 5. Wait for Slack delivery (check via API or webhook)
sleep 3

# 6. Verify in Slack (manual or via test webhook)
echo "Check Slack channel for test message"

# Cleanup
kill $AGENT_PID $BRIDGE_PID $DAEMON_PID
```

---

## 11. Open Questions

### Q1: Single Bot vs Multiple Bots?

**Option A: Single Bot**
- Pros: Simpler setup, one OAuth flow
- Cons: All agents appear as same user, less immersive
- Implementation: Use `username` parameter in chat.postMessage

**Option B: Multiple Bots (Recommended)**
- Pros: Each agent has distinct identity, more realistic
- Cons: Requires creating multiple Slack apps or Enterprise Grid
- Implementation: Manage multiple bot tokens, route based on agent

**Recommendation:** Start with single bot, add multi-bot support in v2.

### Q2: Which Messages to Show?

| Message Type | Default | Configurable |
|--------------|---------|--------------|
| Broadcasts | ✅ Show | Yes |
| Agent → Agent | ✅ Show | Yes |
| Thinking | ❌ Hide | Yes |
| Actions | ✅ Show | Yes |
| Errors | ✅ Show | Yes |

### Q3: Thread Creation Policy?

**Options:**
1. **Always thread:** Every agent message starts/continues a thread
2. **Never thread:** All messages are top-level
3. **Smart threading:** Thread based on context (conversation, task, etc.)
4. **Explicit only:** Only thread when relay specifies `[thread:id]`

**Recommendation:** Option 4 (explicit) - matches existing relay behavior.

### Q4: How to Handle Agent Disconnects?

When an agent disconnects:
1. Post status to channel? ("Alice went offline")
2. Queue messages for later delivery?
3. Return error to Slack user?

**Recommendation:** Queue for reasonable TTL, then error.

### Q5: Slack Enterprise Grid Support?

For organizations with multiple workspaces:
- Org-level app installation
- Cross-workspace messaging
- Unified agent identity

**Recommendation:** Out of scope for v1, design for it in v2.

---

## Appendix

### A. Slack App Manifest

```yaml
# manifest.yml - for Slack app creation
display_information:
  name: Agent Relay Bridge
  description: Connects AI agents to Slack
  background_color: "#4A154B"

features:
  bot_user:
    display_name: AgentRelay
    always_online: true
  slash_commands:
    - command: /relay
      description: Send a message to an agent
      usage_hint: "@AgentName your message"
      should_escape: false

oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - channels:read
      - chat:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - im:write
      - users:read

settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - message.im
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false
```

### B. Dependencies

```json
{
  "dependencies": {
    "@slack/bolt": "^3.17.0",
    "@slack/web-api": "^6.11.0"
  }
}
```

### C. File Structure

```
src/slack/
├── index.ts                    # Public exports
├── slack-bridge-service.ts     # Main orchestration
├── agent-registry.ts           # Agent ↔ Bot mapping
├── thread-store.ts             # Thread synchronization
├── formatter.ts                # Message formatting
├── rate-limiter.ts             # Slack API rate limiting
├── config.ts                   # Configuration loading
└── __tests__/
    ├── formatter.test.ts
    ├── thread-store.test.ts
    ├── agent-registry.test.ts
    └── integration.test.ts
```

### D. Related Work

- [Slack Bolt JS](https://slack.dev/bolt-js/concepts) - Slack app framework
- [agent-relay Protocol](./PROTOCOL.md) - Messaging protocol spec
- [Dashboard Server](../src/dashboard-server/server.ts) - Reference integration
- [Multi-Project Bridge](../src/bridge/multi-project-client.ts) - Bridge pattern

---

## Summary

This proposal outlines a **Slack Bridge** integration for agent-relay that:

1. **Enables bidirectional messaging** between AI agents and Slack
2. **Preserves thread context** across both systems
3. **Leverages existing architecture** (RelayClient, Storage, Router)
4. **Provides flexible configuration** for different use cases
5. **Can be implemented in 3-5 days** with the phased approach

The integration positions agent-relay as a more complete solution for human-AI team collaboration, where humans can observe and participate in agent conversations through familiar Slack interfaces.

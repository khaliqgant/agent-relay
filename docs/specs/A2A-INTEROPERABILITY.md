# Agent Relay ↔ A2A Interoperability Specification

**Version:** 1.0.0-draft
**Status:** Draft
**Authors:** Agent Workforce Team
**Date:** 2026-01-08

---

## Abstract

This specification defines how Agent Relay integrates with the Agent2Agent (A2A) Protocol, enabling local high-performance agent coordination to interoperate with the broader A2A ecosystem. The design positions Agent Relay as a **local runtime and gateway** that bridges the gap between sub-5ms local messaging and enterprise A2A-compatible remote agents.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Architecture Overview](#2-architecture-overview)
3. [Agent Cards](#3-agent-cards)
4. [Task Lifecycle Mapping](#4-task-lifecycle-mapping)
5. [Protocol Translation Layer](#5-protocol-translation-layer)
6. [Transport Bindings](#6-transport-bindings)
7. [Discovery & Registration](#7-discovery--registration)
8. [Security & Authentication](#8-security--authentication)
9. [Streaming & Push Notifications](#9-streaming--push-notifications)
10. [Multi-Turn Conversations](#10-multi-turn-conversations)
11. [Error Handling](#11-error-handling)
12. [Implementation Phases](#12-implementation-phases)
13. [Appendices](#appendices)

---

## 1. Introduction

### 1.1 Background

**Agent Relay** is a high-performance local agent messaging system optimized for <5ms latency between AI agents running on the same machine or within a local network. It uses Unix domain sockets, output pattern parsing, and a central daemon for message routing.

**A2A (Agent2Agent)** is an open protocol by Google and 50+ partners enabling AI agents to discover and communicate across organizational boundaries using HTTP, SSE, and JSON-RPC.

### 1.2 Goals

| Goal | Description |
|------|-------------|
| **Gateway** | Expose local relay agents to the A2A ecosystem |
| **Bridge** | Enable relay agents to invoke remote A2A agents |
| **Preserve Performance** | Maintain <5ms local latency while adding A2A capability |
| **Future-Proof** | Support A2A protocol evolution (currently v0.3) |
| **Minimal Invasion** | No changes required to existing relay agents |

### 1.3 Non-Goals

- Replacing the relay protocol for local communication
- Implementing A2A-only mode (relay protocol remains primary)
- Supporting deprecated A2A features

### 1.4 Terminology

| Term | Definition |
|------|------------|
| **Relay Agent** | An agent connected to the local relay daemon |
| **A2A Agent** | An agent implementing the A2A protocol |
| **A2A Gateway** | Component that translates between relay and A2A |
| **Agent Card** | JSON document describing agent capabilities (A2A spec) |
| **Task** | A2A work unit with lifecycle states |
| **Artifact** | Output produced by A2A task execution |

---

## 2. Architecture Overview

### 2.1 System Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LOCAL RELAY NETWORK (<5ms)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │ Claude  │  │ Codex   │  │ Gemini  │  │ Custom  │                │
│  │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │                │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                │
│       │            │            │            │                      │
│       └────────────┴─────┬──────┴────────────┘                      │
│                          │                                          │
│                    ┌─────┴─────┐                                    │
│                    │  Relay    │                                    │
│                    │  Daemon   │                                    │
│                    └─────┬─────┘                                    │
│                          │                                          │
│                    ┌─────┴─────┐                                    │
│                    │   A2A     │◄─── New Component                  │
│                    │  Gateway  │                                    │
│                    └─────┬─────┘                                    │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
                    HTTP/SSE/gRPC
                           │
┌──────────────────────────┼──────────────────────────────────────────┐
│                    A2A NETWORK                                      │
│                          │                                          │
│         ┌────────────────┼────────────────┐                         │
│         │                │                │                         │
│    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐                     │
│    │Salesforce│    │   SAP   │    │ServiceNow│                     │
│    │  Agent   │    │  Agent  │    │  Agent   │                     │
│    └──────────┘    └─────────┘    └──────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Relay Daemon** | Local message routing, agent registry, persistence |
| **A2A Gateway** | Protocol translation, Agent Card generation, HTTP server |
| **A2A Client** | Outbound connections to remote A2A agents |
| **Card Registry** | Caches discovered A2A Agent Cards |

### 2.3 Data Flow

#### Outbound (Relay → A2A)

```
1. Relay agent sends: ->relay:a2a:salesforce:LeadAgent <<<Query customer>>>
2. Parser detects a2a: prefix
3. Gateway looks up Agent Card for salesforce:LeadAgent
4. Gateway creates A2A Task with message
5. Gateway calls A2A SendMessage RPC
6. Response converted to relay DELIVER envelope
7. Injected back to originating agent
```

#### Inbound (A2A → Relay)

```
1. External A2A client calls POST /.well-known/agent.json
2. Gateway returns Agent Card for requested relay agent
3. Client calls SendMessage with task
4. Gateway creates relay SEND envelope
5. Daemon routes to target agent
6. Agent response captured
7. Gateway updates A2A Task with artifacts
8. A2A client receives response
```

---

## 3. Agent Cards

### 3.1 Overview

Agent Cards are JSON documents that advertise an agent's capabilities. The A2A Gateway automatically generates Agent Cards for registered relay agents.

### 3.2 Agent Card Schema

```typescript
interface AgentCard {
  // Required fields
  name: string;                          // Unique agent identifier
  description: string;                   // Human-readable description
  url: string;                           // Base URL for A2A operations
  version: string;                       // Agent Card version

  // Provider information
  provider?: {
    organization: string;
    url?: string;
  };

  // Capabilities
  capabilities: {
    streaming: boolean;                  // Supports SSE streaming
    pushNotifications: boolean;          // Supports webhooks
    stateTransitionHistory: boolean;     // Tracks task state changes
  };

  // Security
  securitySchemes?: SecurityScheme[];
  security?: SecurityRequirement[];

  // Skills (what the agent can do)
  skills: Skill[];

  // Protocol interfaces
  defaultInputModes: InputMode[];
  defaultOutputModes: OutputMode[];

  // Optional metadata
  documentationUrl?: string;
  supportsAuthenticatedExtendedCard?: boolean;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputSchema?: JSONSchema;              // Expected input format
  outputSchema?: JSONSchema;             // Output format
}

type InputMode = 'text' | 'text/plain' | 'application/json' | 'image/*' | 'audio/*' | 'video/*';
type OutputMode = 'text' | 'text/plain' | 'application/json' | 'image/*' | 'audio/*' | 'video/*';
```

### 3.3 Mapping: Relay Agent → Agent Card

| Relay Field | Agent Card Field | Transformation |
|-------------|------------------|----------------|
| `AgentRecord.name` | `name` | Direct |
| `AgentRecord.profile.description` | `description` | Direct or generate |
| `AgentRecord.profile.title` | `skills[0].name` | First skill name |
| `AgentRecord.profile.capabilities` | `skills` | Map to skill entries |
| `AgentRecord.model` | `provider.organization` | Extract provider |
| `AgentRecord.cli` | `metadata.cli` | Custom metadata |

### 3.4 Agent Card Generation Algorithm

```typescript
function generateAgentCard(agent: AgentRecord, baseUrl: string): AgentCard {
  return {
    name: agent.name,
    description: agent.profile?.description ?? `AI agent: ${agent.name}`,
    url: `${baseUrl}/agents/${encodeURIComponent(agent.name)}`,
    version: '1.0.0',

    provider: {
      organization: extractProvider(agent.model) ?? 'Agent Relay',
      url: 'https://agent-relay.com',
    },

    capabilities: {
      streaming: true,                    // Relay supports real-time
      pushNotifications: true,            // Via webhook integration
      stateTransitionHistory: true,       // Stored in SQLite
    },

    skills: generateSkills(agent),

    defaultInputModes: ['text', 'application/json'],
    defaultOutputModes: ['text', 'application/json'],

    securitySchemes: [{
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    }],
  };
}

function generateSkills(agent: AgentRecord): Skill[] {
  const skills: Skill[] = [];

  // Base skill from profile
  if (agent.profile?.title) {
    skills.push({
      id: slugify(agent.profile.title),
      name: agent.profile.title,
      description: agent.profile.description ?? agent.profile.title,
      tags: agent.profile.tags,
    });
  }

  // Map capabilities to skills
  for (const cap of agent.profile?.capabilities ?? []) {
    skills.push({
      id: slugify(cap),
      name: cap,
      description: `Capability: ${cap}`,
    });
  }

  // Default skill if none defined
  if (skills.length === 0) {
    skills.push({
      id: 'general',
      name: 'General Assistant',
      description: 'General-purpose AI agent',
    });
  }

  return skills;
}
```

### 3.5 Agent Card Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/agent.json` | GET | Default agent card (gateway) |
| `/agents/{name}/.well-known/agent.json` | GET | Specific agent's card |
| `/agents` | GET | List all available agent cards |

### 3.6 Extended Agent Cards

Authenticated requests may receive extended cards with additional details:

```typescript
interface ExtendedAgentCard extends AgentCard {
  // Additional authenticated-only fields
  internalEndpoints?: {
    metrics: string;
    logs: string;
    debug: string;
  };

  rateLimits?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };

  pricing?: {
    model: 'free' | 'usage' | 'subscription';
    details?: string;
  };
}
```

---

## 4. Task Lifecycle Mapping

### 4.1 A2A Task States

```
                    ┌──────────────┐
                    │  SUBMITTED   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │ REJECTED │  │ WORKING  │  │AUTH_REQ'D│
       └──────────┘  └────┬─────┘  └────┬─────┘
                          │             │
           ┌──────────────┼─────────────┼──────────────┐
           │              │             │              │
           ▼              ▼             ▼              ▼
    ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐
    │ COMPLETED │  │  FAILED   │  │CANCELLED │  │INPUT_REQ'D│
    └───────────┘  └───────────┘  └──────────┘  └─────┬─────┘
                                                      │
                                                      ▼
                                               (await input)
```

### 4.2 State Mapping: Relay → A2A

| Relay Concept | A2A Task State | Condition |
|---------------|----------------|-----------|
| SEND received | SUBMITTED | Initial task creation |
| Agent processing | WORKING | Message delivered, awaiting response |
| Agent responds | COMPLETED | Response captured |
| NACK received | REJECTED | Agent declines |
| Agent timeout | FAILED | No response within TTL |
| ACK + no response | INPUT_REQUIRED | Agent requests clarification |
| Connection lost | FAILED | Agent disconnected |

### 4.3 Task Object Structure

```typescript
interface A2ATask {
  id: string;                            // Unique task identifier
  contextId?: string;                    // Conversation context
  status: TaskStatus;

  // Message history
  history: Message[];

  // Generated outputs
  artifacts: Artifact[];

  // Metadata
  metadata: {
    relayMessageId?: string;             // Original relay message ID
    relaySessionId?: string;             // Relay session
    createdAt: string;
    updatedAt: string;
  };
}

interface TaskStatus {
  state: TaskState;
  message?: string;
  timestamp: string;
}

type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'auth-required';

interface Message {
  role: 'user' | 'agent';
  parts: Part[];
  metadata?: Record<string, unknown>;
}

interface Artifact {
  id: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

type Part = TextPart | FilePart | DataPart;

interface TextPart {
  type: 'text';
  text: string;
}

interface FilePart {
  type: 'file';
  file: {
    name: string;
    mimeType: string;
    uri?: string;
    bytes?: string;                      // Base64
  };
}

interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
}
```

### 4.4 Task Lifecycle Implementation

```typescript
class TaskManager {
  private tasks: Map<string, A2ATask> = new Map();
  private relayToTask: Map<string, string> = new Map();  // relay msg id → task id

  /**
   * Create task from incoming A2A request
   */
  createFromA2ARequest(request: SendMessageRequest): A2ATask {
    const task: A2ATask = {
      id: uuid(),
      contextId: request.contextId,
      status: { state: 'submitted', timestamp: now() },
      history: [{ role: 'user', parts: request.message.parts }],
      artifacts: [],
      metadata: { createdAt: now(), updatedAt: now() },
    };

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Update task when relay agent responds
   */
  handleRelayResponse(relayMsgId: string, response: string): void {
    const taskId = this.relayToTask.get(relayMsgId);
    if (!taskId) return;

    const task = this.tasks.get(taskId);
    if (!task) return;

    // Add response to history
    task.history.push({
      role: 'agent',
      parts: [{ type: 'text', text: response }],
    });

    // Create artifact
    task.artifacts.push({
      id: uuid(),
      parts: [{ type: 'text', text: response }],
    });

    // Update status
    task.status = { state: 'completed', timestamp: now() };
    task.metadata.updatedAt = now();
  }

  /**
   * Handle relay agent requesting more input
   */
  handleInputRequired(relayMsgId: string, prompt: string): void {
    const taskId = this.relayToTask.get(relayMsgId);
    if (!taskId) return;

    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = {
      state: 'input-required',
      message: prompt,
      timestamp: now(),
    };
    task.metadata.updatedAt = now();
  }
}
```

---

## 5. Protocol Translation Layer

### 5.1 Overview

The Protocol Translation Layer converts between relay envelopes and A2A messages bidirectionally.

### 5.2 Relay → A2A Translation

```typescript
interface TranslationContext {
  taskId: string;
  contextId?: string;
  targetAgent: string;
}

function relayToA2AMessage(
  envelope: SendEnvelope,
  context: TranslationContext
): SendMessageRequest {
  return {
    message: {
      role: 'user',
      parts: translatePayloadToParts(envelope.payload),
      metadata: {
        relayId: envelope.id,
        relayFrom: envelope.from,
        relayTopic: envelope.topic,
        relayThread: envelope.payload.thread,
      },
    },
    contextId: context.contextId,
    configuration: {
      acceptedOutputModes: ['text', 'application/json'],
    },
  };
}

function translatePayloadToParts(payload: SendPayload): Part[] {
  const parts: Part[] = [];

  // Primary text content
  if (payload.body) {
    parts.push({ type: 'text', text: payload.body });
  }

  // Structured data
  if (payload.data && Object.keys(payload.data).length > 0) {
    // Filter internal metadata
    const publicData = Object.fromEntries(
      Object.entries(payload.data).filter(([k]) => !k.startsWith('_'))
    );

    if (Object.keys(publicData).length > 0) {
      parts.push({ type: 'data', data: publicData });
    }
  }

  return parts;
}
```

### 5.3 A2A → Relay Translation

```typescript
function a2aToRelayEnvelope(
  task: A2ATask,
  targetAgent: string,
  fromA2AAgent: string
): SendEnvelope {
  const latestMessage = task.history[task.history.length - 1];

  return {
    v: PROTOCOL_VERSION,
    type: 'SEND',
    id: uuid(),
    ts: Date.now(),
    from: `a2a:${fromA2AAgent}`,
    to: targetAgent,
    payload: {
      kind: 'message',
      body: extractTextFromParts(latestMessage.parts),
      data: {
        _a2aTaskId: task.id,
        _a2aContextId: task.contextId,
        _a2aFrom: fromA2AAgent,
        ...extractDataFromParts(latestMessage.parts),
      },
      thread: task.contextId,
    },
  };
}

function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.type === 'text')
    .map(p => p.text)
    .join('\n');
}

function extractDataFromParts(parts: Part[]): Record<string, unknown> {
  const dataParts = parts.filter((p): p is DataPart => p.type === 'data');
  return Object.assign({}, ...dataParts.map(p => p.data));
}
```

### 5.4 Artifact Translation

```typescript
function relayResponseToArtifact(
  response: DeliverEnvelope,
  index: number
): Artifact {
  const parts: Part[] = [];

  // Text content
  if (response.payload.body) {
    parts.push({ type: 'text', text: response.payload.body });
  }

  // Structured data
  if (response.payload.data) {
    const publicData = Object.fromEntries(
      Object.entries(response.payload.data).filter(([k]) => !k.startsWith('_'))
    );
    if (Object.keys(publicData).length > 0) {
      parts.push({ type: 'data', data: publicData });
    }
  }

  return {
    id: `artifact-${index}`,
    name: `Response ${index + 1}`,
    parts,
    metadata: {
      relayMessageId: response.id,
      relayFrom: response.from,
      timestamp: response.ts,
    },
  };
}
```

---

## 6. Transport Bindings

### 6.1 Supported Bindings

| Binding | Priority | Use Case |
|---------|----------|----------|
| **JSON-RPC 2.0 over HTTP** | Primary | Standard A2A compatibility |
| **gRPC** | Secondary | High-performance scenarios |
| **HTTP+JSON REST** | Tertiary | Simple integrations |

### 6.2 JSON-RPC Binding (Primary)

#### Endpoint

```
POST /a2a/rpc
Content-Type: application/json
```

#### Methods

| Method | Description |
|--------|-------------|
| `message/send` | Send message, create/update task |
| `message/stream` | Send with SSE streaming response |
| `tasks/get` | Get task by ID |
| `tasks/list` | List tasks with filters |
| `tasks/cancel` | Cancel a task |
| `tasks/subscribe` | Subscribe to task updates |
| `pushNotifications/set` | Configure webhook |
| `pushNotifications/get` | Get webhook config |
| `pushNotifications/list` | List webhook configs |
| `pushNotifications/delete` | Remove webhook |
| `agent/card` | Get extended agent card |

#### Request Format

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params: Record<string, unknown>;
}

// Example: Send Message
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "message/send",
  "params": {
    "agentId": "CodeReviewer",
    "message": {
      "role": "user",
      "parts": [
        { "type": "text", "text": "Review this code for security issues" }
      ]
    },
    "contextId": "review-session-123"
  }
}
```

#### Response Format

```typescript
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Example: Success
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "task": {
      "id": "task-abc123",
      "status": { "state": "working" },
      "history": [...],
      "artifacts": []
    }
  }
}

// Example: Error
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32001,
    "message": "Agent not found",
    "data": { "agentId": "Unknown" }
  }
}
```

### 6.3 Streaming Binding (SSE)

#### Endpoint

```
POST /a2a/stream
Content-Type: application/json
Accept: text/event-stream
```

#### Event Types

```typescript
type StreamEvent =
  | { event: 'task.status'; data: TaskStatus }
  | { event: 'task.artifact'; data: Artifact }
  | { event: 'task.message'; data: Message }
  | { event: 'task.complete'; data: A2ATask }
  | { event: 'error'; data: JsonRpcError };
```

#### Example Stream

```
event: task.status
data: {"state":"working","timestamp":"2026-01-08T12:00:00Z"}

event: task.message
data: {"role":"agent","parts":[{"type":"text","text":"Analyzing code..."}]}

event: task.artifact
data: {"id":"art-1","parts":[{"type":"text","text":"Found 3 issues..."}]}

event: task.complete
data: {"id":"task-123","status":{"state":"completed"},...}
```

### 6.4 HTTP REST Binding (Alternative)

For simpler integrations, a REST-style API is also available:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/a2a/agents` | GET | List agents |
| `/a2a/agents/{id}` | GET | Get agent card |
| `/a2a/tasks` | POST | Create task |
| `/a2a/tasks` | GET | List tasks |
| `/a2a/tasks/{id}` | GET | Get task |
| `/a2a/tasks/{id}` | DELETE | Cancel task |
| `/a2a/tasks/{id}/messages` | POST | Add message to task |
| `/a2a/tasks/{id}/subscribe` | GET | SSE subscription |

---

## 7. Discovery & Registration

### 7.1 Agent Discovery Flow

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ A2A Client  │          │ A2A Gateway │          │Relay Daemon │
└──────┬──────┘          └──────┬──────┘          └──────┬──────┘
       │                        │                        │
       │ GET /.well-known/      │                        │
       │     agent.json         │                        │
       │───────────────────────►│                        │
       │                        │                        │
       │                        │  Query agent registry  │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │◄───────────────────────│
       │                        │   AgentRecord[]        │
       │                        │                        │
       │◄───────────────────────│                        │
       │    AgentCard[]         │                        │
       │                        │                        │
```

### 7.2 Remote Agent Discovery

The gateway can also discover and cache remote A2A agent cards:

```typescript
interface RemoteAgentRegistry {
  /**
   * Discover agent at URL
   */
  discover(url: string): Promise<AgentCard>;

  /**
   * Get cached card
   */
  get(agentId: string): AgentCard | undefined;

  /**
   * Refresh all cached cards
   */
  refresh(): Promise<void>;

  /**
   * Search for agents by skill
   */
  search(query: {
    skill?: string;
    capability?: string;
    provider?: string;
  }): AgentCard[];
}
```

### 7.3 Card Caching Strategy

```typescript
interface CardCache {
  card: AgentCard;
  fetchedAt: number;
  expiresAt: number;           // Default: 1 hour
  etag?: string;
  lastModified?: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour
const STALE_WHILE_REVALIDATE_MS = 5 * 60 * 1000;  // 5 minutes grace
```

### 7.4 Relay Agent Addressing

```
Format: a2a:{namespace}:{agent}

Examples:
  a2a:local:CodeReviewer          # Local relay agent
  a2a:salesforce:LeadAgent        # Remote Salesforce agent
  a2a:acme.com:SupportBot         # Remote agent by domain
```

---

## 8. Security & Authentication

### 8.1 Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trust Boundaries                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Local Trust Zone (relay)                    │   │
│  │  • Unix socket permissions                               │   │
│  │  • Process-level isolation                               │   │
│  │  • No encryption (same machine)                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                         A2A Gateway                             │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              External Trust Zone (A2A)                   │   │
│  │  • TLS required                                          │   │
│  │  • Token-based authentication                            │   │
│  │  • Per-agent authorization                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Supported Authentication Schemes

```typescript
type SecurityScheme =
  | ApiKeyScheme
  | HttpAuthScheme
  | OAuth2Scheme
  | OpenIdConnectScheme
  | MutualTLSScheme;

interface ApiKeyScheme {
  type: 'apiKey';
  name: string;                 // Header or query param name
  in: 'header' | 'query';
}

interface HttpAuthScheme {
  type: 'http';
  scheme: 'basic' | 'bearer';
  bearerFormat?: string;        // e.g., 'JWT'
}

interface OAuth2Scheme {
  type: 'oauth2';
  flows: {
    clientCredentials?: {
      tokenUrl: string;
      scopes: Record<string, string>;
    };
    authorizationCode?: {
      authorizationUrl: string;
      tokenUrl: string;
      scopes: Record<string, string>;
    };
  };
}

interface OpenIdConnectScheme {
  type: 'openIdConnect';
  openIdConnectUrl: string;
}

interface MutualTLSScheme {
  type: 'mutualTLS';
}
```

### 8.3 Gateway Authentication Flow

```typescript
class A2AAuthenticator {
  /**
   * Verify incoming A2A request
   */
  async authenticate(req: Request): Promise<AuthResult> {
    const token = this.extractToken(req);

    if (!token) {
      return { authenticated: false, error: 'Missing credentials' };
    }

    // Verify JWT
    const payload = await this.verifyJwt(token);

    return {
      authenticated: true,
      principal: {
        id: payload.sub,
        agent: payload.agent,
        scopes: payload.scopes ?? [],
      },
    };
  }

  /**
   * Authenticate outgoing A2A request
   */
  async getCredentials(agentCard: AgentCard): Promise<Credentials> {
    const scheme = this.selectScheme(agentCard.securitySchemes);

    switch (scheme.type) {
      case 'http':
        return this.getBearerToken(agentCard);
      case 'oauth2':
        return this.getOAuth2Token(agentCard, scheme);
      case 'apiKey':
        return this.getApiKey(agentCard);
      default:
        throw new Error(`Unsupported scheme: ${scheme.type}`);
    }
  }
}
```

### 8.4 Authorization

```typescript
interface AuthorizationPolicy {
  /**
   * Check if principal can access agent
   */
  canAccessAgent(principal: Principal, agentName: string): boolean;

  /**
   * Check if principal can invoke skill
   */
  canInvokeSkill(principal: Principal, agentName: string, skillId: string): boolean;

  /**
   * Get allowed scopes for agent
   */
  getAllowedScopes(principal: Principal, agentName: string): string[];
}

// Default policy: allow all authenticated requests
const defaultPolicy: AuthorizationPolicy = {
  canAccessAgent: (p) => p.authenticated,
  canInvokeSkill: (p) => p.authenticated,
  getAllowedScopes: () => ['*'],
};
```

### 8.5 Signed Agent Cards (A2A v0.3+)

```typescript
interface SignedAgentCard extends AgentCard {
  signature?: {
    algorithm: 'RS256' | 'ES256';
    keyId: string;
    value: string;              // Base64 signature
  };

  publicKeys?: {
    keyId: string;
    algorithm: string;
    publicKeyPem: string;
  }[];
}
```

---

## 9. Streaming & Push Notifications

### 9.1 Streaming Support

The A2A Gateway supports real-time streaming for long-running tasks:

```typescript
interface StreamingOptions {
  /**
   * Enable SSE streaming for response
   */
  streaming: boolean;

  /**
   * Events to include in stream
   */
  includeEvents?: ('status' | 'message' | 'artifact' | 'thinking')[];

  /**
   * Heartbeat interval for keepalive
   */
  heartbeatMs?: number;
}
```

### 9.2 Streaming Implementation

```typescript
async function* streamTaskUpdates(
  taskId: string,
  options: StreamingOptions
): AsyncGenerator<StreamEvent> {
  const task = taskManager.get(taskId);
  if (!task) throw new TaskNotFoundError(taskId);

  // Subscribe to relay messages for this task
  const messageStream = relay.subscribe({
    filter: (msg) => msg.payload.data?._a2aTaskId === taskId,
  });

  try {
    for await (const message of messageStream) {
      // Status update
      if (options.includeEvents?.includes('status')) {
        yield {
          event: 'task.status',
          data: task.status,
        };
      }

      // Message update
      if (options.includeEvents?.includes('message')) {
        yield {
          event: 'task.message',
          data: {
            role: 'agent',
            parts: [{ type: 'text', text: message.payload.body }],
          },
        };
      }

      // Check for completion
      if (isTerminalState(task.status.state)) {
        yield { event: 'task.complete', data: task };
        return;
      }
    }
  } finally {
    messageStream.close();
  }
}
```

### 9.3 Push Notifications (Webhooks)

```typescript
interface PushNotificationConfig {
  id: string;
  taskId: string;
  url: string;                   // Webhook URL

  events: PushEventType[];

  authentication?: {
    type: 'bearer' | 'basic' | 'hmac';
    credentials: string;         // Token or secret
  };

  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

type PushEventType =
  | 'task.status'
  | 'task.completed'
  | 'task.failed'
  | 'task.input-required';
```

### 9.4 Webhook Delivery

```typescript
class WebhookDelivery {
  async deliver(
    config: PushNotificationConfig,
    event: StreamEvent
  ): Promise<void> {
    const payload = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      taskId: config.taskId,
      event: event.event,
      data: event.data,
    };

    const signature = this.sign(payload, config.authentication);

    await this.sendWithRetry(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Signature': signature,
        'X-A2A-Delivery-Id': payload.id,
      },
      body: JSON.stringify(payload),
    }, config.retryPolicy);
  }
}
```

---

## 10. Multi-Turn Conversations

### 10.1 Context Management

A2A supports multi-turn conversations through `contextId`:

```typescript
interface ConversationContext {
  id: string;                    // Context identifier
  tasks: string[];               // Task IDs in this context
  metadata: {
    createdAt: string;
    lastActivityAt: string;
    relayThread?: string;        // Mapped relay thread ID
  };
}
```

### 10.2 Context ↔ Thread Mapping

```typescript
class ContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private threadToContext: Map<string, string> = new Map();

  /**
   * Get or create context for relay thread
   */
  getOrCreateForThread(threadId: string): ConversationContext {
    const existingContextId = this.threadToContext.get(threadId);
    if (existingContextId) {
      return this.contexts.get(existingContextId)!;
    }

    const context: ConversationContext = {
      id: uuid(),
      tasks: [],
      metadata: {
        createdAt: now(),
        lastActivityAt: now(),
        relayThread: threadId,
      },
    };

    this.contexts.set(context.id, context);
    this.threadToContext.set(threadId, context.id);

    return context;
  }

  /**
   * Get relay thread for A2A context
   */
  getThreadForContext(contextId: string): string | undefined {
    return this.contexts.get(contextId)?.metadata.relayThread;
  }
}
```

### 10.3 Follow-Up Messages

```typescript
async function handleFollowUp(
  taskId: string,
  message: Message
): Promise<A2ATask> {
  const task = taskManager.get(taskId);

  if (task.status.state !== 'input-required') {
    throw new InvalidStateError(
      `Cannot send follow-up to task in state: ${task.status.state}`
    );
  }

  // Add message to history
  task.history.push(message);

  // Translate and send to relay agent
  const relayMsg = a2aToRelayEnvelope(task, task.metadata.targetAgent, 'a2a');
  await relay.send(relayMsg);

  // Update status
  task.status = { state: 'working', timestamp: now() };

  return task;
}
```

---

## 11. Error Handling

### 11.1 A2A Error Types

```typescript
interface A2AError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Standard error codes
const A2A_ERRORS = {
  TASK_NOT_FOUND: 'TaskNotFoundError',
  PUSH_NOT_SUPPORTED: 'PushNotificationNotSupportedError',
  UNSUPPORTED_OPERATION: 'UnsupportedOperationError',
  CONTENT_TYPE_NOT_SUPPORTED: 'ContentTypeNotSupportedError',
  VERSION_NOT_SUPPORTED: 'VersionNotSupportedError',
  INVALID_REQUEST: 'InvalidRequestError',
  AGENT_NOT_FOUND: 'AgentNotFoundError',
  AUTHENTICATION_REQUIRED: 'AuthenticationRequiredError',
  AUTHORIZATION_FAILED: 'AuthorizationFailedError',
  RATE_LIMITED: 'RateLimitedError',
  INTERNAL_ERROR: 'InternalError',
} as const;
```

### 11.2 Error Mapping: Relay → A2A

| Relay Error | A2A Error | HTTP Status |
|-------------|-----------|-------------|
| Agent not found | AgentNotFoundError | 404 |
| NACK (busy) | RateLimitedError | 429 |
| NACK (invalid) | InvalidRequestError | 400 |
| NACK (forbidden) | AuthorizationFailedError | 403 |
| Connection timeout | InternalError | 500 |
| Message TTL exceeded | TaskNotFoundError | 404 |

### 11.3 JSON-RPC Error Codes

```typescript
const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // A2A-specific (custom range: -32000 to -32099)
  TASK_NOT_FOUND: -32001,
  AGENT_NOT_FOUND: -32002,
  UNSUPPORTED_OPERATION: -32003,
  AUTHENTICATION_REQUIRED: -32004,
  AUTHORIZATION_FAILED: -32005,
  RATE_LIMITED: -32006,
  VERSION_NOT_SUPPORTED: -32007,
};
```

### 11.4 Error Response Format

```typescript
// JSON-RPC error response
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32001,
    "message": "Task not found",
    "data": {
      "taskId": "task-xyz",
      "type": "TaskNotFoundError"
    }
  }
}

// HTTP REST error response
{
  "error": {
    "code": "TaskNotFoundError",
    "message": "Task not found",
    "details": {
      "taskId": "task-xyz"
    }
  }
}
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Basic A2A Gateway with Agent Card generation

| Task | Priority | Effort |
|------|----------|--------|
| Agent Card generator | P0 | 2d |
| `/.well-known/agent.json` endpoint | P0 | 1d |
| Basic HTTP server | P0 | 1d |
| Task manager | P0 | 2d |
| Protocol translation layer | P0 | 2d |

**Deliverables:**
- Relay agents discoverable via Agent Cards
- Basic SendMessage working

### Phase 2: Core Operations (Week 3-4)

**Goal:** Full A2A operation support

| Task | Priority | Effort |
|------|----------|--------|
| JSON-RPC binding | P0 | 3d |
| Task lifecycle management | P0 | 2d |
| GetTask / ListTasks | P0 | 2d |
| CancelTask | P1 | 1d |
| Multi-turn context | P1 | 2d |

**Deliverables:**
- Complete JSON-RPC API
- Task state machine working

### Phase 3: Streaming & Push (Week 5-6)

**Goal:** Real-time capabilities

| Task | Priority | Effort |
|------|----------|--------|
| SSE streaming | P0 | 3d |
| Push notification config | P1 | 2d |
| Webhook delivery | P1 | 2d |
| Heartbeat/keepalive | P1 | 1d |

**Deliverables:**
- Real-time task updates
- Webhook notifications

### Phase 4: Security & Polish (Week 7-8)

**Goal:** Production-ready

| Task | Priority | Effort |
|------|----------|--------|
| JWT authentication | P0 | 2d |
| OAuth2 client credentials | P1 | 2d |
| Signed Agent Cards | P2 | 2d |
| Rate limiting | P1 | 1d |
| Metrics & logging | P1 | 2d |
| Documentation | P0 | 2d |

**Deliverables:**
- Secure by default
- Observable and debuggable

### Phase 5: Extended Features (Future)

| Task | Priority | Notes |
|------|----------|-------|
| gRPC binding | P2 | High-performance option |
| Remote agent discovery | P1 | Connect to A2A ecosystem |
| Agent Card signing | P2 | A2A v0.3+ |
| Batch operations | P2 | Efficiency for bulk tasks |

---

## Appendices

### A. File Structure

```
src/
├── a2a/
│   ├── index.ts                    # Exports
│   ├── gateway.ts                  # Main A2A Gateway class
│   ├── agent-card.ts               # Agent Card generation
│   ├── task-manager.ts             # Task lifecycle
│   ├── translator.ts               # Protocol translation
│   ├── context-manager.ts          # Multi-turn context
│   ├── auth/
│   │   ├── authenticator.ts        # Inbound auth
│   │   ├── credentials.ts          # Outbound credentials
│   │   └── jwt.ts                  # JWT utilities
│   ├── transport/
│   │   ├── jsonrpc.ts              # JSON-RPC binding
│   │   ├── rest.ts                 # HTTP REST binding
│   │   ├── streaming.ts            # SSE streaming
│   │   └── grpc.ts                 # gRPC binding (future)
│   ├── push/
│   │   ├── config.ts               # Webhook config
│   │   └── delivery.ts             # Webhook delivery
│   ├── discovery/
│   │   ├── card-registry.ts        # Remote card cache
│   │   └── resolver.ts             # Agent resolution
│   └── errors.ts                   # Error types
├── protocol/
│   └── types.ts                    # (existing)
└── daemon/
    └── router.ts                   # (existing, add A2A hooks)
```

### B. Configuration

```typescript
interface A2AGatewayConfig {
  // Server
  enabled: boolean;
  port: number;                      // Default: 3889
  host: string;                      // Default: '127.0.0.1'
  basePath: string;                  // Default: '/a2a'

  // TLS
  tls?: {
    cert: string;
    key: string;
    ca?: string;
  };

  // Authentication
  auth: {
    enabled: boolean;
    jwtSecret?: string;
    jwtPublicKey?: string;
    issuer?: string;
  };

  // Agent Cards
  agentCards: {
    baseUrl: string;                 // Public URL
    defaultCapabilities: {
      streaming: boolean;
      pushNotifications: boolean;
    };
  };

  // Discovery
  discovery: {
    enabled: boolean;
    cacheTtlMs: number;
    knownAgents: Array<{
      namespace: string;
      url: string;
    }>;
  };

  // Push notifications
  push: {
    enabled: boolean;
    maxWebhooksPerTask: number;
    retryPolicy: {
      maxAttempts: number;
      backoffMs: number;
    };
  };

  // Limits
  limits: {
    maxTasksPerContext: number;
    maxMessageSizeBytes: number;
    requestTimeoutMs: number;
  };
}

// Default configuration
const DEFAULT_CONFIG: A2AGatewayConfig = {
  enabled: true,
  port: 3889,
  host: '127.0.0.1',
  basePath: '/a2a',

  auth: {
    enabled: true,
  },

  agentCards: {
    baseUrl: 'http://localhost:3889',
    defaultCapabilities: {
      streaming: true,
      pushNotifications: true,
    },
  },

  discovery: {
    enabled: true,
    cacheTtlMs: 3600000,
    knownAgents: [],
  },

  push: {
    enabled: true,
    maxWebhooksPerTask: 5,
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
  },

  limits: {
    maxTasksPerContext: 100,
    maxMessageSizeBytes: 10 * 1024 * 1024,
    requestTimeoutMs: 300000,
  },
};
```

### C. CLI Commands

```bash
# Start gateway
agent-relay a2a start [--port 3889] [--config path/to/config.json]

# Show agent cards
agent-relay a2a cards [--agent NAME]

# Discover remote agent
agent-relay a2a discover <url>

# List cached remote agents
agent-relay a2a remotes

# Test A2A endpoint
agent-relay a2a test <url> --method message/send --message "Hello"
```

### D. Version Compatibility

| agent-relay | A2A Protocol | Notes |
|-------------|--------------|-------|
| 1.4.x | 0.2, 0.3 | Initial A2A support |
| 1.5.x | 0.3, 0.4 | gRPC binding |
| 2.0.x | 1.0 | Full A2A v1 compliance |

### E. References

- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A GitHub Repository](https://github.com/a2aproject/A2A)
- [Google Developers Blog: A2A Announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [Agent Relay Protocol](./PROTOCOL.md)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0-draft | 2026-01-08 | Initial specification |

---

*This specification is a living document and will evolve as both agent-relay and A2A protocol mature.*

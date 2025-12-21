# Agent Relay Federation: Cross-Server Communication Proposal

## Executive Summary

This proposal extends agent-relay to support **federated multi-server deployments** while preserving the core differentiator: **automatic message injection via tmux**. Unlike polling-based systems (mcp_agent_mail OSS), federated agent-relay maintains real-time, interrupt-driven communication across server boundaries.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEDERATED AGENT-RELAY                              │
│                                                                              │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│  │  Server A   │         │  Server B   │         │  Server C   │           │
│  │             │         │             │         │             │           │
│  │ ┌───┐ ┌───┐ │  wss:// │ ┌───┐ ┌───┐ │  wss:// │ ┌───┐       │           │
│  │ │Ali│ │Bob│ │◄───────►│ │Car│ │Dav│ │◄───────►│ │Eve│       │           │
│  │ └─┬─┘ └─┬─┘ │         │ └─┬─┘ └─┬─┘ │         │ └─┬─┘       │           │
│  │   │     │   │         │   │     │   │         │   │         │           │
│  │ ┌─┴─────┴─┐ │         │ ┌─┴─────┴─┐ │         │ ┌─┴───┐     │           │
│  │ │ Daemon  │ │         │ │ Daemon  │ │         │ │Daemon│     │           │
│  │ └─────────┘ │         │ └─────────┘ │         │ └─────┘     │           │
│  └─────────────┘         └─────────────┘         └─────────────┘           │
│                                                                              │
│  • Agents run in tmux (unchanged)                                           │
│  • Local injection via send-keys (unchanged)                                │
│  • Cross-server routing via WebSocket (NEW)                                 │
│  • Fleet-wide agent discovery (NEW)                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Architecture Overview](#2-architecture-overview)
3. [Network Topology](#3-network-topology)
4. [Protocol Specification](#4-protocol-specification)
5. [Agent Discovery & Registry](#5-agent-discovery--registry)
6. [Message Routing](#6-message-routing)
7. [Security Model](#7-security-model)
8. [Failure Handling & Resilience](#8-failure-handling--resilience)
9. [Configuration](#9-configuration)
10. [CLI Interface](#10-cli-interface)
11. [Implementation Plan](#11-implementation-plan)
12. [Migration Path](#12-migration-path)

---

## 1. Design Principles

### 1.1 Preserve the Core Magic

The #1 requirement is preserving **automatic message injection**:

```
Message arrives → tmux send-keys → Agent receives as user input
```

This is what differentiates agent-relay from polling-based systems. Federation must not compromise this.

### 1.2 Separation of Concerns

```
┌─────────────────────────────────────────────────────────┐
│                    ROUTING LAYER (NEW)                   │
│         Cross-server message delivery via WebSocket      │
├─────────────────────────────────────────────────────────┤
│                  INJECTION LAYER (UNCHANGED)             │
│         Local tmux send-keys for each server             │
└─────────────────────────────────────────────────────────┘
```

- **Routing** is a network problem → WebSocket between daemons
- **Injection** is a local problem → tmux send-keys (unchanged)

### 1.3 Progressive Enhancement

- Single-server deployments work exactly as before
- Federation is opt-in via configuration
- No breaking changes to existing setups

### 1.4 Operational Simplicity

- No external dependencies (Redis, NATS) required
- Optional hub for convenience, not required
- Static peer configuration works fine
- Simple CLI for fleet management

---

## 2. Architecture Overview

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER NODE                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AGENT LAYER                                  │   │
│  │                                                                      │   │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │   │
│  │   │ tmux: Alice  │    │ tmux: Bob    │    │ tmux: Carol  │         │   │
│  │   │ (claude)     │    │ (codex)      │    │ (gemini)     │         │   │
│  │   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │   │
│  │          │ capture-pane      │                   │                  │   │
│  │          │ send-keys         │                   │                  │   │
│  │          ▼                   ▼                   ▼                  │   │
│  │   ┌──────────────────────────────────────────────────────────┐     │   │
│  │   │                   TmuxWrapper (per agent)                 │     │   │
│  │   │  • Parse @relay: patterns                                 │     │   │
│  │   │  • Inject incoming messages                               │     │   │
│  │   │  • Connect to local daemon                                │     │   │
│  │   └──────────────────────────┬───────────────────────────────┘     │   │
│  │                              │ Unix Socket                         │   │
│  └──────────────────────────────┼─────────────────────────────────────┘   │
│                                 │                                          │
│  ┌──────────────────────────────▼─────────────────────────────────────┐   │
│  │                         DAEMON LAYER                                │   │
│  │                                                                      │   │
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌────────────────┐ │   │
│  │   │  LocalServer    │    │  PeerManager    │    │  Registry      │ │   │
│  │   │  (Unix socket)  │    │  (WebSocket)    │    │  (agents map)  │ │   │
│  │   │                 │    │                 │    │                │ │   │
│  │   │ • Accept local  │    │ • Connect peers │    │ • Local agents │ │   │
│  │   │   connections   │    │ • Route cross-  │    │ • Remote agents│ │   │
│  │   │ • Handle HELLO  │    │   server msgs   │    │ • Server map   │ │   │
│  │   └────────┬────────┘    └────────┬────────┘    └────────┬───────┘ │   │
│  │            │                      │                      │         │   │
│  │            └──────────────────────┼──────────────────────┘         │   │
│  │                                   │                                 │   │
│  │                         ┌─────────▼─────────┐                      │   │
│  │                         │      Router       │                      │   │
│  │                         │                   │                      │   │
│  │                         │ • Decide local vs │                      │   │
│  │                         │   remote routing  │                      │   │
│  │                         │ • Handle broadcast│                      │   │
│  │                         │ • Queue on disco- │                      │   │
│  │                         │   nnect           │                      │   │
│  │                         └───────────────────┘                      │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                 │                                          │
│                                 │ WebSocket (wss://)                       │
│                                 ▼                                          │
│                    ┌─────────────────────────────┐                        │
│                    │       PEER SERVERS          │                        │
│                    │   (other fleet members)     │                        │
│                    └─────────────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow: Cross-Server Message

```
Alice@ServerA sends to Bob@ServerB:

┌─────────────────────────────────────────────────────────────────────────────┐
│ SERVER A                                                                     │
│                                                                              │
│ 1. Alice outputs: @relay:Bob Can you review auth.ts?                        │
│         │                                                                    │
│         ▼                                                                    │
│ 2. TmuxWrapper captures via tmux capture-pane                               │
│         │                                                                    │
│         ▼                                                                    │
│ 3. Parser extracts: { to: "Bob", body: "Can you review auth.ts?" }          │
│         │                                                                    │
│         ▼                                                                    │
│ 4. RelayClient sends SEND envelope to local daemon (Unix socket)            │
│         │                                                                    │
│         ▼                                                                    │
│ 5. Router checks registry: Bob not local, Bob is on ServerB                 │
│         │                                                                    │
│         ▼                                                                    │
│ 6. PeerManager sends PEER_ROUTE to ServerB (WebSocket)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ wss:// (TLS encrypted)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SERVER B                                                                     │
│                                                                              │
│ 7. PeerManager receives PEER_ROUTE                                          │
│         │                                                                    │
│         ▼                                                                    │
│ 8. Router looks up Bob in local connections                                 │
│         │                                                                    │
│         ▼                                                                    │
│ 9. Router calls TmuxWrapper.deliverToLocal(Bob, envelope)                   │
│         │                                                                    │
│         ▼                                                                    │
│ 10. TmuxWrapper executes:                                                   │
│     tmux send-keys -t relay-Bob-12345 -l "Relay message from Alice..."      │
│     tmux send-keys -t relay-Bob-12345 Enter                                 │
│         │                                                                    │
│         ▼                                                                    │
│ 11. Bob's agent receives message AS USER INPUT                              │
│     (automatic, no polling, no checking!)                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Network Topology

### 3.1 Topology Options

#### Option A: Full Mesh (Recommended for <10 servers)

```
        ServerA ◄────────► ServerB
           ▲                  ▲
           │                  │
           │                  │
           ▼                  ▼
        ServerC ◄────────► ServerD
```

- Every daemon connects to every other daemon
- O(n²) connections, but fine for small fleets
- No single point of failure
- Lowest latency (direct paths)

#### Option B: Hub-and-Spoke (Recommended for 10+ servers)

```
                    ┌─────────┐
         ┌─────────►│   Hub   │◄─────────┐
         │          └────┬────┘          │
         │               │               │
         ▼               ▼               ▼
     ServerA         ServerB         ServerC
```

- All daemons connect to central hub
- Hub routes messages between servers
- Single point of failure (mitigate with hub HA)
- Simpler operations

#### Option C: Hybrid (Recommended for production)

```
                    ┌─────────┐
         ┌─────────►│ Hub     │◄─────────┐
         │          │(discover)│          │
         │          └─────────┘          │
         │                               │
         ▼                               ▼
     ServerA ◄─────────────────────► ServerB
         ▲                               ▲
         │                               │
         └───────────► ServerC ◄─────────┘
```

- Hub provides discovery and registry sync
- Daemons establish direct peer connections
- Messages route directly (low latency)
- Hub failure doesn't break existing connections

### 3.2 Recommended Approach

**Hybrid topology with optional hub:**

1. Daemons can be configured with static peer list (no hub needed)
2. Optionally connect to hub for dynamic discovery
3. Once peers are known, establish direct connections
4. Hub going down doesn't break messaging (just discovery)

---

## 4. Protocol Specification

### 4.1 Peer Protocol Messages

Extend the existing envelope format with peer-specific message types:

```typescript
// New message types for federation
type PeerMessageType =
  | 'PEER_HELLO'      // Initial handshake
  | 'PEER_WELCOME'    // Handshake response
  | 'PEER_SYNC'       // Registry synchronization
  | 'PEER_ROUTE'      // Route message to local agent
  | 'PEER_BROADCAST'  // Broadcast to local agents
  | 'PEER_PING'       // Heartbeat
  | 'PEER_PONG'       // Heartbeat response
  | 'PEER_BYE';       // Graceful disconnect

// Peer envelope (over WebSocket)
interface PeerEnvelope<T = unknown> {
  v: 1;                    // Protocol version
  type: PeerMessageType;
  id: string;              // Message UUID
  ts: number;              // Timestamp
  from_server: string;     // Originating server ID
  payload: T;
}
```

### 4.2 PEER_HELLO / PEER_WELCOME

Initial handshake between daemons:

```typescript
// Client → Server
interface PeerHelloPayload {
  server_id: string;           // e.g., "nyc-prod-01"
  server_name?: string;        // Human-readable name
  version: string;             // agent-relay version
  capabilities: {
    max_message_size: number;
    supports_broadcast: boolean;
    supports_topics: boolean;
  };
  agents: AgentInfo[];         // Local agents to register
  auth_token: string;          // Pre-shared token
}

// Server → Client
interface PeerWelcomePayload {
  server_id: string;
  session_id: string;          // For reconnection
  agents: AgentInfo[];         // Server's local agents
  peers: PeerInfo[];           // Other known peers (for mesh)
  config: {
    heartbeat_ms: number;      // Ping interval
    sync_interval_ms: number;  // Registry sync interval
  };
}

interface AgentInfo {
  name: string;
  server_id: string;
  cli?: string;                // claude, codex, gemini
  connected_at: string;        // ISO timestamp
  status: 'online' | 'idle' | 'busy';
}

interface PeerInfo {
  server_id: string;
  url: string;                 // WebSocket URL
  agents: string[];            // Agent names on this peer
}
```

### 4.3 PEER_SYNC

Registry updates when agents join/leave:

```typescript
interface PeerSyncPayload {
  type: 'agent_joined' | 'agent_left' | 'full_sync';
  agents?: AgentInfo[];        // For full_sync
  agent?: AgentInfo;           // For join/leave
}
```

### 4.4 PEER_ROUTE

Forward a message to a specific agent:

```typescript
interface PeerRoutePayload {
  original_envelope: Envelope<SendPayload>;  // The actual message
  target_agent: string;                       // Local agent name
  hops: string[];                             // Servers traversed (loop prevention)
}
```

### 4.5 PEER_BROADCAST

Forward a broadcast to all local agents:

```typescript
interface PeerBroadcastPayload {
  original_envelope: Envelope<SendPayload>;
  exclude_agents?: string[];   // Don't deliver to these
  scope?: 'fleet' | 'server';  // Broadcast scope
}
```

### 4.6 Connection State Machine

```
                     ┌─────────────────┐
                     │  DISCONNECTED   │◄─────────────────────┐
                     └────────┬────────┘                      │
                              │ connect()                     │
                              ▼                               │
                     ┌─────────────────┐                      │
          ┌──────────│   CONNECTING    │──────────┐           │
          │          └────────┬────────┘          │           │
          │                   │ socket open       │           │
          │ error             ▼                   │ error     │
          │          ┌─────────────────┐          │           │
          │          │  HANDSHAKING    │──────────┤           │
          │          └────────┬────────┘          │           │
          │                   │ WELCOME received  │           │
          │                   ▼                   │           │
          │          ┌─────────────────┐          │           │
          │          │     ACTIVE      │──────────┤           │
          │          └────────┬────────┘          │           │
          │                   │ BYE or error      │           │
          │                   ▼                   │           │
          │          ┌─────────────────┐          │           │
          └─────────►│   RECONNECTING  │◄─────────┘           │
                     └────────┬────────┘                      │
                              │ max retries                   │
                              └───────────────────────────────┘

  Reconnection: exponential backoff 1s → 2s → 4s → 8s → 16s → 30s (max)
  Max attempts: unlimited (peers are persistent)
```

---

## 5. Agent Discovery & Registry

### 5.1 Registry Structure

```typescript
interface FleetRegistry {
  // All known agents across the fleet
  agents: Map<string, AgentRecord>;

  // Server information
  servers: Map<string, ServerRecord>;

  // Index for fast lookup
  agentToServer: Map<string, string>;  // agentName → serverId
}

interface AgentRecord {
  name: string;
  server_id: string;
  qualified_name: string;      // "Alice@nyc-prod-01"
  cli?: string;
  status: 'online' | 'idle' | 'offline';
  connected_at: string;
  last_seen: string;
  metadata?: Record<string, unknown>;
}

interface ServerRecord {
  id: string;
  name?: string;
  url: string;
  status: 'connected' | 'disconnected' | 'unknown';
  agents: Set<string>;
  connected_at?: string;
  last_seen: string;
  latency_ms?: number;
}
```

### 5.2 Name Resolution

Agents can be addressed in multiple ways:

| Pattern | Resolution |
|---------|------------|
| `@relay:Bob` | Local first, then fleet-wide lookup |
| `@relay:Bob@nyc` | Explicitly route to server "nyc" |
| `@relay:Bob@*` | Send to ALL agents named Bob (rare) |
| `@relay:*` | Broadcast to entire fleet |
| `@relay:*@local` | Broadcast to local server only |
| `@relay:*@nyc` | Broadcast to all agents on "nyc" |

### 5.3 Name Collision Handling

If two agents have the same name on different servers:

1. **Local preference**: Unqualified name routes to local agent first
2. **First-registered wins**: For fleet-wide lookup, first to register owns the name
3. **Explicit qualification**: Use `@relay:Bob@server-id` to disambiguate
4. **Warning on collision**: Daemon logs warning when collision detected

```typescript
// Resolution algorithm
function resolveAgent(name: string, fromServer: string): AgentRecord | null {
  // Check for explicit qualification
  if (name.includes('@')) {
    const [agentName, serverSpec] = name.split('@');
    return registry.findOnServer(agentName, serverSpec);
  }

  // Try local first
  const local = registry.findLocal(name, fromServer);
  if (local) return local;

  // Fleet-wide lookup (first registered)
  return registry.findAny(name);
}
```

### 5.4 Registry Synchronization

Registries sync via gossip-like protocol:

```
Server A joins fleet:
1. A → B: PEER_HELLO (includes A's agents)
2. B → A: PEER_WELCOME (includes B's agents + known peers)
3. A → C: PEER_HELLO (A learned about C from B)
4. A → B: PEER_SYNC (A now knows about C's agents)
...eventually consistent...
```

**Sync triggers:**
- New peer connection
- Agent joins/leaves locally
- Periodic full sync (every 60s)
- On reconnection after disconnect

---

## 6. Message Routing

### 6.1 Routing Algorithm

```typescript
class FederatedRouter {
  route(from: string, envelope: Envelope<SendPayload>): void {
    const target = envelope.to;

    // 1. Broadcast handling
    if (target === '*' || target?.startsWith('*@')) {
      return this.handleBroadcast(from, envelope, target);
    }

    // 2. Resolve target agent
    const resolved = this.registry.resolve(target, this.serverId);
    if (!resolved) {
      this.sendNack(from, envelope.id, 'UNKNOWN_AGENT');
      return;
    }

    // 3. Local delivery
    if (resolved.server_id === this.serverId) {
      this.deliverLocal(from, resolved.name, envelope);
      return;
    }

    // 4. Remote delivery
    this.deliverRemote(from, resolved, envelope);
  }

  private handleBroadcast(from: string, envelope: Envelope, scope: string): void {
    const [, serverSpec] = scope.split('@');

    // Deliver to local agents (except sender)
    if (!serverSpec || serverSpec === 'local' || serverSpec === this.serverId) {
      for (const agent of this.localAgents) {
        if (agent.name !== from) {
          this.deliverLocal(from, agent.name, envelope);
        }
      }
    }

    // Forward to peers (unless local-only)
    if (serverSpec !== 'local') {
      for (const peer of this.peers.values()) {
        if (!serverSpec || peer.serverId === serverSpec) {
          peer.send({
            type: 'PEER_BROADCAST',
            payload: {
              original_envelope: envelope,
              exclude_agents: [from],
            }
          });
        }
      }
    }
  }

  private deliverRemote(
    from: string,
    target: AgentRecord,
    envelope: Envelope
  ): void {
    const peer = this.peers.get(target.server_id);

    if (!peer || peer.state !== 'ACTIVE') {
      // Queue for later delivery
      this.queueMessage(target.server_id, envelope);
      return;
    }

    peer.send({
      type: 'PEER_ROUTE',
      payload: {
        original_envelope: envelope,
        target_agent: target.name,
        hops: [this.serverId],
      }
    });
  }
}
```

### 6.2 Message Queuing

When a peer is disconnected, messages are queued:

```typescript
interface QueuedMessage {
  envelope: Envelope;
  target_server: string;
  queued_at: number;
  attempts: number;
  expires_at: number;  // TTL
}

class MessageQueue {
  private queues: Map<string, QueuedMessage[]>;

  enqueue(serverId: string, envelope: Envelope): void {
    const queue = this.queues.get(serverId) ?? [];
    queue.push({
      envelope,
      target_server: serverId,
      queued_at: Date.now(),
      attempts: 0,
      expires_at: Date.now() + 3600000,  // 1 hour TTL
    });
    this.queues.set(serverId, queue);
  }

  // Called when peer reconnects
  flush(serverId: string, peer: PeerConnection): void {
    const queue = this.queues.get(serverId) ?? [];
    for (const msg of queue) {
      if (Date.now() < msg.expires_at) {
        peer.send({ type: 'PEER_ROUTE', payload: msg.envelope });
      }
    }
    this.queues.delete(serverId);
  }
}
```

### 6.3 Loop Prevention

Prevent messages from bouncing between servers:

```typescript
interface PeerRoutePayload {
  // ... other fields
  hops: string[];  // Servers this message has traversed
}

// On receiving PEER_ROUTE
function handlePeerRoute(msg: PeerEnvelope<PeerRoutePayload>): void {
  // Check for loop
  if (msg.payload.hops.includes(this.serverId)) {
    console.warn('Loop detected, dropping message');
    return;
  }

  // Add ourselves to hops if forwarding
  if (needsForwarding) {
    msg.payload.hops.push(this.serverId);
  }
}
```

---

## 7. Security Model

### 7.1 Authentication

**Pre-shared tokens** for simplicity:

```yaml
# Server A config
auth:
  server_token: "server-a-secret-token"
  peer_tokens:
    server-b: "shared-secret-ab"
    server-c: "shared-secret-ac"
```

Tokens are exchanged in PEER_HELLO and validated before PEER_WELCOME.

### 7.2 Transport Security

**Mandatory TLS** for peer connections:

```typescript
const ws = new WebSocket(peerUrl, {
  // TLS configuration
  rejectUnauthorized: true,  // Verify peer certificate
  ca: fs.readFileSync('/etc/agent-relay/ca.pem'),

  // Client certificate (for mTLS)
  cert: fs.readFileSync('/etc/agent-relay/client.pem'),
  key: fs.readFileSync('/etc/agent-relay/client-key.pem'),
});
```

### 7.3 Authorization

Simple capability model:

```typescript
interface ServerCapabilities {
  can_broadcast: boolean;       // Can send fleet-wide broadcasts
  can_route_to: string[];       // Allowed target servers
  max_message_rate: number;     // Rate limit (msgs/sec)
  allowed_agents: string[];     // Can message these agents (or '*')
}
```

### 7.4 Security Checklist

| Control | Status | Notes |
|---------|--------|-------|
| TLS encryption | Required | wss:// only |
| Peer authentication | Required | Pre-shared token |
| mTLS (mutual TLS) | Optional | For high-security |
| Message signing | Future | Verify message origin |
| Rate limiting | Recommended | Prevent floods |
| Audit logging | Recommended | Log all cross-server |

---

## 8. Failure Handling & Resilience

### 8.1 Connection Failures

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONNECTION FAILURE HANDLING                   │
│                                                                  │
│  Peer disconnects                                                │
│       │                                                          │
│       ▼                                                          │
│  Mark peer as DISCONNECTED                                       │
│       │                                                          │
│       ├──► Queue outbound messages                               │
│       │                                                          │
│       ├──► Start reconnection timer                              │
│       │    (exponential backoff: 1s, 2s, 4s, ... 30s max)       │
│       │                                                          │
│       └──► Notify local agents (optional)                        │
│            "@relay:* [SYSTEM] Lost connection to server-b"       │
│                                                                  │
│  On reconnect:                                                   │
│       │                                                          │
│       ├──► Re-authenticate (PEER_HELLO/WELCOME)                 │
│       │                                                          │
│       ├──► Sync registries (PEER_SYNC full_sync)                │
│       │                                                          │
│       └──► Flush queued messages                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Split Brain Prevention

If the fleet gets partitioned:

1. **Agents remain addressable** within their partition
2. **Cross-partition messages queue** until healed
3. **No automatic conflict resolution** - messages deliver in order received
4. **TTL expiration** - queued messages expire after 1 hour (configurable)

### 8.3 Graceful Degradation

```
Fleet healthy:     A ◄──► B ◄──► C    (full connectivity)

B goes down:       A ◄─X─► B ◄─X─► C
                   A ◄──────────────► C  (A-C still works)

B comes back:      A ◄──► B ◄──► C    (queued messages flush)
```

### 8.4 Health Monitoring

```typescript
// Heartbeat every 30 seconds
setInterval(() => {
  for (const peer of this.peers.values()) {
    if (peer.state === 'ACTIVE') {
      peer.send({ type: 'PEER_PING', ts: Date.now() });

      // If no PONG in 60s, consider dead
      peer.setTimeout(() => {
        if (!peer.lastPong || Date.now() - peer.lastPong > 60000) {
          peer.reconnect();
        }
      }, 60000);
    }
  }
}, 30000);
```

---

## 9. Configuration

### 9.1 Configuration File

```yaml
# /etc/agent-relay/config.yaml (or ~/.agent-relay/config.yaml)

# Server identity
server:
  id: nyc-prod-01                    # Unique server ID
  name: "NYC Production 01"          # Human-readable name

# Local daemon settings (unchanged from current)
local:
  socket_path: /tmp/agent-relay/relay.sock
  storage_path: /tmp/agent-relay/messages.sqlite

# Federation settings (NEW)
federation:
  enabled: true

  # Listen for peer connections
  listen:
    host: 0.0.0.0
    port: 8765

  # TLS configuration
  tls:
    enabled: true
    cert: /etc/agent-relay/server.pem
    key: /etc/agent-relay/server-key.pem
    ca: /etc/agent-relay/ca.pem       # For client verification
    mutual: false                      # Require client certs

  # Authentication
  auth:
    # This server's token (peers use this to connect to us)
    server_token: "${RELAY_SERVER_TOKEN}"

    # Tokens for connecting to peers
    peer_tokens:
      london-prod-01: "${RELAY_TOKEN_LONDON}"
      tokyo-prod-01: "${RELAY_TOKEN_TOKYO}"

  # Peer connections
  peers:
    - url: wss://london.example.com:8765
      server_id: london-prod-01
      auto_connect: true

    - url: wss://tokyo.example.com:8765
      server_id: tokyo-prod-01
      auto_connect: true

  # Optional hub for discovery
  hub:
    url: wss://hub.example.com:8765
    token: "${RELAY_HUB_TOKEN}"
    enabled: false                    # Hub is optional

  # Behavior settings
  settings:
    heartbeat_interval_ms: 30000      # Ping peers every 30s
    reconnect_max_delay_ms: 30000     # Max backoff delay
    message_queue_ttl_ms: 3600000     # 1 hour queue TTL
    sync_interval_ms: 60000           # Full registry sync
    max_message_size_bytes: 1048576   # 1 MiB

# Dashboard settings
dashboard:
  enabled: true
  port: 3888
  show_fleet: true                    # Show all fleet agents
```

### 9.2 Environment Variables

All config can be overridden via environment:

```bash
# Server identity
AGENT_RELAY_SERVER_ID=nyc-prod-01
AGENT_RELAY_SERVER_NAME="NYC Production 01"

# Federation
AGENT_RELAY_FEDERATION_ENABLED=true
AGENT_RELAY_FEDERATION_PORT=8765
AGENT_RELAY_SERVER_TOKEN=secret-token
AGENT_RELAY_PEER_london-prod-01_TOKEN=london-token
AGENT_RELAY_PEER_london-prod-01_URL=wss://london.example.com:8765
```

### 9.3 Minimal Configuration

For simple two-server setup:

```yaml
# Server A (nyc)
server:
  id: nyc
federation:
  enabled: true
  listen:
    port: 8765
  auth:
    server_token: "shared-secret"
  peers:
    - url: wss://london.example.com:8765
      server_id: london
```

```yaml
# Server B (london)
server:
  id: london
federation:
  enabled: true
  listen:
    port: 8765
  auth:
    server_token: "shared-secret"
  peers:
    - url: wss://nyc.example.com:8765
      server_id: nyc
```

---

## 10. CLI Interface

### 10.1 New Commands

```bash
# Start daemon with federation
agent-relay up [--peer-port 8765] [--config /path/to/config.yaml]

# Peer management
agent-relay peer list                           # List connected peers
agent-relay peer add <url> [--token <token>]    # Add peer dynamically
agent-relay peer remove <server-id>             # Remove peer
agent-relay peer status <server-id>             # Detailed peer status

# Fleet-wide agent listing
agent-relay agents                     # Local agents only (default)
agent-relay agents --fleet             # All agents in fleet
agent-relay agents --server <id>       # Agents on specific server

# Send to remote agent
agent-relay send <agent>[@<server>] <message>

# Fleet status
agent-relay fleet status               # Overview of all servers
agent-relay fleet topology             # Show connection graph

# Debugging
agent-relay fleet ping <server-id>     # Ping a peer
agent-relay fleet trace <agent>        # Trace route to agent
```

### 10.2 Example Session

```bash
# On Server NYC
$ agent-relay up --peer-port 8765
Daemon started (federation enabled)
Listening for peers on :8765
Connecting to peer: london.example.com:8765...
Connected to london (3 agents)
Connecting to peer: tokyo.example.com:8765...
Connected to tokyo (2 agents)

$ agent-relay agents --fleet
AGENT         SERVER    CLI      STATUS    CONNECTED
Alice         nyc       claude   online    2 min ago
Bob           nyc       codex    online    5 min ago
Carol         london    claude   online    1 min ago
Dave          london    gemini   idle      10 min ago
Eve           tokyo     claude   online    3 min ago

$ agent-relay fleet status
SERVER    STATUS       AGENTS    LATENCY    LAST SEEN
nyc       local        2         -          -
london    connected    2         45ms       just now
tokyo     connected    1         120ms      2s ago

# Start an agent that can message across servers
$ agent-relay -n Alice claude

# Inside Claude session:
# Alice> @relay:Carol Can you help with the auth module?
# [relay:Alice] → Carol@london: Can you help with the auth module?

# Carol (on london server) automatically receives:
# "Relay message from Alice@nyc [abc123]: Can you help with the auth module?"
```

### 10.3 Addressing Examples

```bash
# From Alice on NYC server:

@relay:Bob hello                    # Bob is local (NYC) → local delivery
@relay:Carol hello                  # Carol is on london → routes to london
@relay:Carol@london hello           # Explicit: route to Carol on london
@relay:Eve@tokyo hello              # Explicit: route to Eve on tokyo
@relay:* Status update              # Broadcast to ALL agents in fleet
@relay:*@local Status update        # Broadcast only to NYC agents
@relay:*@london Status update       # Broadcast to all london agents
```

---

## 11. Implementation Plan

### 11.1 Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation (1 week)                                                 │
│                                                                              │
│ • Define peer protocol types (src/protocol/peer-types.ts)                   │
│ • Implement PeerConnection class (src/federation/peer-connection.ts)        │
│ • Implement basic HELLO/WELCOME handshake                                   │
│ • Add peer WebSocket listener to daemon                                     │
│ • Unit tests for protocol                                                   │
│                                                                              │
│ Deliverable: Two daemons can connect and handshake                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Registry & Discovery (1 week)                                       │
│                                                                              │
│ • Implement FleetRegistry (src/federation/registry.ts)                      │
│ • Implement PEER_SYNC message handling                                      │
│ • Add registry to Router for lookups                                        │
│ • Implement name resolution (local → fleet)                                 │
│ • CLI: `agent-relay agents --fleet`                                         │
│                                                                              │
│ Deliverable: Agents visible across servers                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Message Routing (1 week)                                            │
│                                                                              │
│ • Implement PEER_ROUTE handling                                             │
│ • Implement PEER_BROADCAST handling                                         │
│ • Integrate with existing Router                                            │
│ • Cross-server message delivery                                             │
│ • Local tmux injection on receipt (existing code!)                          │
│                                                                              │
│ Deliverable: Alice@NYC can message Bob@London automatically                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Resilience (1 week)                                                 │
│                                                                              │
│ • Implement reconnection logic                                              │
│ • Implement message queue for disconnected peers                            │
│ • Implement heartbeat (PING/PONG)                                           │
│ • Handle graceful shutdown (PEER_BYE)                                       │
│ • CLI: `agent-relay peer status`                                            │
│                                                                              │
│ Deliverable: Fleet survives server restarts                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Security & Polish (1 week)                                          │
│                                                                              │
│ • Add TLS support for peer connections                                      │
│ • Add token-based authentication                                            │
│ • Add configuration file support                                            │
│ • Update dashboard for fleet view                                           │
│ • Documentation                                                             │
│                                                                              │
│ Deliverable: Production-ready federation                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 File Structure

```
src/
├── federation/                    # NEW: Federation module
│   ├── index.ts                   # Exports
│   ├── peer-connection.ts         # WebSocket connection to peer
│   ├── peer-manager.ts            # Manages all peer connections
│   ├── peer-server.ts             # WebSocket server for incoming
│   ├── registry.ts                # Fleet-wide agent registry
│   ├── message-queue.ts           # Queue for disconnected peers
│   └── config.ts                  # Federation configuration
│
├── protocol/
│   ├── types.ts                   # Existing types
│   └── peer-types.ts              # NEW: Peer protocol types
│
├── daemon/
│   ├── server.ts                  # Modified: integrate federation
│   ├── router.ts                  # Modified: federated routing
│   └── ...
│
└── cli/
    └── index.ts                   # Modified: new commands
```

### 11.3 Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Foundation | 3-4 days | None |
| Phase 2: Registry | 3-4 days | Phase 1 |
| Phase 3: Routing | 3-4 days | Phase 2 |
| Phase 4: Resilience | 3-4 days | Phase 3 |
| Phase 5: Security | 3-4 days | Phase 4 |
| **Total** | **~4-5 weeks** | |

---

## 12. Migration Path

### 12.1 Backward Compatibility

Existing single-server deployments work without changes:

```yaml
# No federation block = single-server mode (current behavior)
local:
  socket_path: /tmp/agent-relay/relay.sock
```

### 12.2 Upgrade Path

1. **Update agent-relay** to federation-capable version
2. **Add federation config** to enable cross-server
3. **Start daemons** - they auto-connect to peers
4. **Agents just work** - no changes needed

### 12.3 Rollback

If issues arise:
1. Set `federation.enabled: false`
2. Restart daemon
3. Back to single-server mode

---

## Summary

This proposal extends agent-relay to support federated multi-server deployments while **preserving the core differentiator**: automatic message injection via tmux.

**Key points:**

1. **Injection stays local** - Each server runs tmux sessions, does local send-keys
2. **Routing goes network** - Daemons connect via WebSocket for cross-server
3. **Progressive enhancement** - Single-server still works, federation is opt-in
4. **Simple operations** - Static peer config works, hub optional
5. **Resilient** - Reconnection, message queuing, graceful degradation

**What we preserve:**
- Zero-config agent integration (@relay: pattern)
- Automatic message delivery (no polling)
- Low latency (<5ms local, +network RTT remote)
- Simple mental model

**What we add:**
- Cross-server messaging
- Fleet-wide agent discovery
- Peer-to-peer daemon connections
- Message queuing for resilience

---

## Next Steps

1. Review and approve this proposal
2. Create implementation tasks in Beads
3. Begin Phase 1: Foundation

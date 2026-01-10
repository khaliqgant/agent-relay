# Proposal: Direct Socket Integration with llm-tldr

**Status**: Draft
**Author**: Claude
**Date**: 2026-01-10

## Executive Summary

This proposal outlines a direct socket integration between agent-relay and llm-tldr, enabling agents to query code analysis services through the relay protocol. Both systems use similar architectures (Unix socket daemons with JSON protocols), making integration natural and low-latency.

## Problem Statement

Agents working on code tasks currently lack structured codebase context. They either:
1. Read entire files (token-expensive, often exceeds context)
2. Grep for keywords (misses semantic relationships)
3. Ask users for context (slow, interruptive)

llm-tldr solves this by providing:
- 95% token reduction through structural extraction
- Semantic search (find code by behavior, not keywords)
- Call graphs, data flow, impact analysis

**Goal**: Give agents seamless access to llm-tldr's analysis through the relay protocol.

## Dependency Resolution (The Hard Problem)

### The Ecosystem Mismatch

| Component | agent-relay | llm-tldr |
|-----------|-------------|----------|
| Language | TypeScript | Python |
| Runtime | Node.js ≥18 | Python ≥3.10 |
| Package Manager | npm | pip |
| Install Size | ~50MB | ~2GB (ML models) |
| Heavy Deps | better-sqlite3 | sentence-transformers, faiss |

**These are two different ecosystems.** The socket protocol is the easy part. Getting tldr installed and running is the real challenge.

### Option Analysis

#### Option 1: User Responsibility (Manual Install)

**How it works:**
```bash
# User installs separately
pip install llm-tldr
tldr warm /path/to/project
tldr daemon &

# Relay auto-detects socket
agent-relay up  # Finds /tmp/tldr-<hash>.sock
```

**Implementation:**
```typescript
// src/services/tldr-discovery.ts
async function discoverTldr(projectPath: string): Promise<string | null> {
  // tldr uses MD5 hash of project path for socket naming
  const hash = crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 8);
  const socketPath = `/tmp/tldr-${hash}.sock`;

  if (await socketExists(socketPath)) {
    return socketPath;
  }
  return null;
}
```

| Pros | Cons |
|------|------|
| Zero coupling | Bad UX - most users won't do it |
| User controls versions | No visibility into why queries fail |
| Simple to implement | Python env conflicts possible |

**Verdict**: MVP baseline. Document it, detect it, but don't rely on it.

---

#### Option 2: Subprocess Management

**How it works:**
```typescript
// src/services/tldr-manager.ts
async function ensureTldr(projectPath: string): Promise<string> {
  // Check for existing daemon
  const existing = await discoverTldr(projectPath);
  if (existing) return existing;

  // Check if tldr is installed
  try {
    await execAsync('tldr --version');
  } catch {
    // Install it
    await execAsync('pip install llm-tldr');
  }

  // Warm the index
  await execAsync(`tldr warm ${projectPath}`);

  // Start daemon
  const proc = spawn('tldr', ['daemon', '--project', projectPath], {
    detached: true,
    stdio: 'ignore'
  });
  proc.unref();

  // Wait for socket
  return waitForSocket(projectPath);
}
```

| Pros | Cons |
|------|------|
| Automatic for users | Python version conflicts |
| "Just works" feel | 2GB surprise download |
| We control lifecycle | Cross-platform shell differences |
| | Which `pip`? System? Venv? |

**Verdict**: Risky. Works on developer machines, breaks on servers.

---

#### Option 3: Docker Sidecar

**How it works:**
```yaml
# docker-compose.tldr.yml
services:
  tldr:
    image: ghcr.io/parcadei/llm-tldr:latest
    volumes:
      - ${PROJECT_PATH}:/workspace:ro
      - tldr-cache:/cache
      - /tmp:/tmp  # Share socket
    command: ["daemon", "--project", "/workspace", "--socket", "/tmp/tldr.sock"]

volumes:
  tldr-cache:
```

```typescript
// src/services/tldr-docker.ts
async function ensureTldrContainer(projectPath: string): Promise<string> {
  const containerName = 'agent-relay-tldr';

  // Check if running
  const running = await execAsync(`docker ps -q -f name=${containerName}`);
  if (running.stdout.trim()) {
    return '/tmp/tldr.sock';
  }

  // Start container
  await execAsync(`docker compose -f docker-compose.tldr.yml up -d`, {
    env: { PROJECT_PATH: projectPath }
  });

  return '/tmp/tldr.sock';
}
```

| Pros | Cons |
|------|------|
| Isolated, reproducible | Requires Docker |
| No Python conflicts | ~3GB image size |
| Easy version pinning | Volume mount complexity |
| Works on any platform | Extra resource overhead |

**Verdict**: Best for teams/production. Add to existing `docker-compose.dev.yml`.

---

#### Option 4: npm Wrapper Package

**How it works:**
```bash
npm install @agent-relay/tldr
```

```typescript
// @agent-relay/tldr/src/index.ts
import { PythonShell } from 'python-shell';
import { join } from 'path';

export class TldrService {
  private pythonPath: string;

  async install(): Promise<void> {
    // Create isolated venv in node_modules
    const venvPath = join(__dirname, '..', '.venv');
    await execAsync(`python3 -m venv ${venvPath}`);

    this.pythonPath = join(venvPath, 'bin', 'python');
    await execAsync(`${this.pythonPath} -m pip install llm-tldr`);
  }

  async startDaemon(projectPath: string): Promise<string> {
    // Spawn daemon with our venv Python
    spawn(this.pythonPath, ['-m', 'tldr', 'daemon', '--project', projectPath]);
    return waitForSocket(projectPath);
  }
}
```

| Pros | Cons |
|------|------|
| npm install experience | Still needs Python 3.10+ |
| Isolated venv | 2GB in node_modules |
| Version locked | Cross-platform Python path hell |
| | postinstall script failures |

**Verdict**: Appealing UX, but fragile. Python-in-npm is notoriously problematic.

---

#### Option 5: Cloud-Hosted Service

**How it works:**
```
agent-relay → WebSocket → tldr.agentworkforce.com → tldr daemon
```

```typescript
// src/services/tldr-cloud.ts
export class TldrCloudClient {
  private ws: WebSocket;

  constructor(private apiKey: string) {
    this.ws = new WebSocket('wss://tldr.agentworkforce.com/v1/ws', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
  }

  async semantic(query: string, projectId: string): Promise<SearchResult[]> {
    // Project must be pre-indexed via CI/CD or webhook
    return this.send({ cmd: 'semantic', query, project: projectId });
  }
}
```

| Pros | Cons |
|------|------|
| Zero local install | 50-200ms latency (defeats purpose) |
| Central index management | Requires uploading code |
| Works everywhere | Monthly hosting costs |
| | Privacy concerns |

**Verdict**: Only for cloud-hosted agent-relay. Not for local.

---

#### Option 6: Native TypeScript Port (Long-term)

**How it works:**
- tree-sitter has Node.js bindings (`tree-sitter`, `tree-sitter-typescript`, etc.)
- Embeddings via `@xenova/transformers` (ONNX runtime)
- FAISS alternative: `hnswlib-node` or `vectra`

```typescript
// @agent-relay/code-analysis (hypothetical)
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { pipeline } from '@xenova/transformers';

export class CodeAnalyzer {
  private parser: Parser;
  private embedder: any;

  async init(): Promise<void> {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
    this.embedder = await pipeline('feature-extraction', 'Xenova/bge-large-en-v1.5');
  }

  async extractSignatures(code: string): Promise<Signature[]> {
    const tree = this.parser.parse(code);
    // Walk AST, extract functions/classes
  }

  async semanticSearch(query: string): Promise<SearchResult[]> {
    const embedding = await this.embedder(query);
    // Search HNSW index
  }
}
```

| Pros | Cons |
|------|------|
| First-class integration | Massive effort (months) |
| Single runtime | Must maintain parity with llm-tldr |
| npm native | Model loading still heavy |
| No Python | Different behavior possible |

**Verdict**: Strategic investment. Consider if llm-tldr becomes critical.

---

### Recommended Approach: Tiered Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Tier 1: Detection Only                   │
│  • Auto-discover running tldr daemon                        │
│  • Document manual installation                             │
│  • Graceful "tldr not available" messaging                  │
│  • Zero dependencies added                                  │
│  Timeline: Immediate                                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Tier 2: Docker Integration                 │
│  • Add tldr to docker-compose.dev.yml                       │
│  • CLI: `agent-relay services up tldr`                      │
│  • Auto-start container if Docker available                 │
│  • Share socket via /tmp mount                              │
│  Timeline: +2 weeks                                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Tier 3: Managed Installation                 │
│  • `agent-relay tldr install` command                       │
│  • Creates isolated Python venv                             │
│  • `agent-relay tldr daemon` lifecycle management           │
│  • Fallback when Docker unavailable                         │
│  Timeline: +4 weeks                                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Tier 4: Evaluate Native Port                   │
│  • Prototype tree-sitter + transformers.js                  │
│  • Benchmark against Python implementation                  │
│  • Decision: port vs. maintain bridge                       │
│  Timeline: +3 months (evaluation only)                      │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1 Implementation (MVP)

```typescript
// src/services/tldr-service.ts

export type TldrAvailability =
  | { available: true; socketPath: string; version: string }
  | { available: false; reason: string; suggestion: string };

export async function checkTldrAvailability(
  projectPath: string
): Promise<TldrAvailability> {
  // 1. Check for running daemon via socket
  const socketPath = await discoverTldrSocket(projectPath);
  if (socketPath) {
    const version = await pingTldrDaemon(socketPath);
    if (version) {
      return { available: true, socketPath, version };
    }
  }

  // 2. Check if tldr CLI is installed
  try {
    const { stdout } = await execAsync('tldr --version');
    return {
      available: false,
      reason: 'tldr installed but daemon not running',
      suggestion: `Run: tldr daemon --project ${projectPath}`
    };
  } catch {
    // Not installed
  }

  // 3. Check if Docker is available
  try {
    await execAsync('docker --version');
    return {
      available: false,
      reason: 'tldr not installed',
      suggestion: 'Run: agent-relay services up tldr (requires Docker)'
    };
  } catch {
    // No Docker
  }

  // 4. Fallback: manual install instructions
  return {
    available: false,
    reason: 'tldr not installed and Docker not available',
    suggestion: 'Install with: pip install llm-tldr && tldr warm . && tldr daemon'
  };
}
```

### Tier 2 Implementation (Docker)

```yaml
# Additions to docker-compose.dev.yml

services:
  # ... existing postgres, redis ...

  tldr:
    image: ghcr.io/parcadei/llm-tldr:1.0
    profiles: ["tldr"]  # Only start with --profile tldr
    volumes:
      - ${TLDR_PROJECT_PATH:-.}:/workspace:ro
      - tldr-index:/root/.tldr
      - /tmp/agent-relay:/tmp/agent-relay  # Socket sharing
    environment:
      - TLDR_SOCKET_PATH=/tmp/agent-relay/tldr.sock
    command: >
      sh -c "tldr warm /workspace && tldr daemon --socket /tmp/agent-relay/tldr.sock"
    healthcheck:
      test: ["CMD", "tldr", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  tldr-index:
```

```typescript
// src/cli/commands/services.ts

program
  .command('services')
  .argument('<action>', 'up | down | status')
  .argument('[service...]', 'postgres, redis, tldr')
  .action(async (action, services) => {
    if (action === 'up' && services.includes('tldr')) {
      const projectPath = process.cwd();
      await execAsync(
        `TLDR_PROJECT_PATH=${projectPath} docker compose -f docker-compose.dev.yml --profile tldr up -d tldr`
      );
      console.log('tldr service starting... waiting for index build');
      await waitForHealthy('tldr');
      console.log('tldr ready at /tmp/agent-relay/tldr.sock');
    }
  });
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent Relay Daemon                           │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐   │
│  │ Agent A │  │ Agent B │  │ Agent C │  │ Service: tldr       │   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────────┬──────────┘   │
│       │            │            │                   │              │
│       └────────────┴────────────┴───────────────────┘              │
│                              │                                      │
│                         Router                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  Service Connector   │
                    │  (new component)     │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │   llm-tldr Daemon    │
                    │   Unix Socket        │
                    │   JSON Protocol      │
                    └─────────────────────┘
```

## Design Principles

1. **Service as First-Class Entity**: tldr appears as a routable entity (like an agent), but with service semantics
2. **Request-Response Pattern**: Unlike agent messaging, service calls are synchronous with timeouts
3. **Zero Agent Code Changes**: Agents use existing `->relay:` patterns
4. **Lazy Connection**: Connect to tldr daemon on first query, not at startup
5. **Graceful Degradation**: If tldr unavailable, return helpful error (not crash)

## Protocol Extension

### New Entity Type: `service`

Extend `EntityType` to include services:

```typescript
// src/protocol/types.ts
export type EntityType = 'agent' | 'user' | 'service';
```

### Service Registration

Services register with capabilities:

```typescript
interface ServiceHelloPayload extends HelloPayload {
  entityType: 'service';
  service: {
    name: string;           // 'tldr'
    version: string;        // '1.0.0'
    capabilities: string[]; // ['semantic', 'context', 'impact', 'calls']
  };
}
```

### Service Request Envelope

New message type for service calls:

```typescript
// src/protocol/types.ts
export type MessageType =
  | /* existing types */
  | 'SERVICE_REQUEST'
  | 'SERVICE_RESPONSE';

interface ServiceRequestPayload {
  service: string;          // 'tldr'
  method: string;           // 'semantic', 'context', 'impact', etc.
  params: Record<string, unknown>;
  timeout_ms?: number;      // Default: 30000
}

interface ServiceResponsePayload {
  request_id: string;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

## Wire Protocol for tldr Integration

### Option A: Protocol Bridge (Recommended)

Create a bridge that translates relay protocol to tldr's existing JSON protocol:

```typescript
// src/services/tldr-bridge.ts

import net from 'node:net';
import { EventEmitter } from 'node:events';

interface TldrCommand {
  cmd: string;
  [key: string]: unknown;
}

interface TldrResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class TldrBridge extends EventEmitter {
  private socket: net.Socket | null = null;
  private socketPath: string;
  private connected = false;
  private pendingRequests: Map<string, {
    resolve: (value: TldrResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private buffer = '';

  constructor(socketPath: string = '/tmp/tldr.sock') {
    super();
    this.socketPath = socketPath;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.rejectAllPending(new Error('Connection closed'));
      });

      this.socket.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  private handleData(data: Buffer): void {
    // tldr uses newline-delimited JSON
    this.buffer += data.toString('utf-8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as TldrResponse & { id?: string };
        const pending = this.pendingRequests.get(response.id || '');
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id || '');
          pending.resolve(response);
        }
      } catch (err) {
        this.emit('error', new Error(`Invalid JSON from tldr: ${line}`));
      }
    }
  }

  async send(command: TldrCommand, timeoutMs = 30000): Promise<TldrResponse> {
    if (!this.connected) {
      await this.connect();
    }

    const id = crypto.randomUUID();
    const payload = JSON.stringify({ ...command, id }) + '\n';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for tldr response (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.socket!.write(payload);
    });
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  // Convenience methods mapping to tldr commands

  async semantic(query: string, limit = 10): Promise<unknown> {
    return this.send({ cmd: 'semantic', query, limit });
  }

  async context(target: string, depth = 2): Promise<unknown> {
    return this.send({ cmd: 'context', target, depth });
  }

  async impact(target: string, depth = 3): Promise<unknown> {
    return this.send({ cmd: 'impact', target, depth });
  }

  async calls(target: string, direction: 'callers' | 'callees' = 'callees'): Promise<unknown> {
    return this.send({ cmd: 'calls', target, direction });
  }

  async structure(path?: string): Promise<unknown> {
    return this.send({ cmd: 'structure', path });
  }

  async extract(symbol: string): Promise<unknown> {
    return this.send({ cmd: 'extract', symbol });
  }
}
```

### Option B: Native Relay Connection

Have tldr connect as a service to the relay daemon directly:

```python
# Example: tldr connecting to relay as a service
# (Would require changes to llm-tldr codebase)

import socket
import json
import struct

class RelayServiceClient:
    def __init__(self, socket_path='/tmp/agent-relay.sock'):
        self.socket_path = socket_path
        self.sock = None

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)

        # Send HELLO as service
        hello = {
            'v': 1,
            'type': 'HELLO',
            'id': str(uuid.uuid4()),
            'ts': int(time.time() * 1000),
            'payload': {
                'agent': 'tldr',
                'entityType': 'service',
                'capabilities': {
                    'ack': True,
                    'resume': False,
                    'max_inflight': 10,
                    'supports_topics': False
                },
                'service': {
                    'name': 'tldr',
                    'version': '1.0.0',
                    'capabilities': ['semantic', 'context', 'impact', 'calls']
                }
            }
        }
        self._send(hello)

    def _send(self, envelope):
        data = json.dumps(envelope).encode('utf-8')
        header = struct.pack('>I', len(data))
        self.sock.sendall(header + data)
```

## Router Integration

### Service Manager

New component to manage service connections:

```typescript
// src/daemon/service-manager.ts

import { TldrBridge } from '../services/tldr-bridge.js';
import { serviceLog } from '../utils/logger.js';

export interface ServiceConfig {
  name: string;
  type: 'tldr' | 'custom';
  socketPath?: string;
  enabled: boolean;
}

export class ServiceManager {
  private services: Map<string, TldrBridge> = new Map();
  private configs: ServiceConfig[];

  constructor(configs: ServiceConfig[] = []) {
    this.configs = configs;
  }

  async initialize(): Promise<void> {
    for (const config of this.configs) {
      if (!config.enabled) continue;

      if (config.type === 'tldr') {
        const bridge = new TldrBridge(config.socketPath);
        try {
          await bridge.connect();
          this.services.set(config.name, bridge);
          serviceLog.info(`Service connected: ${config.name}`);
        } catch (err) {
          serviceLog.warn(`Service unavailable: ${config.name}`, { error: String(err) });
        }
      }
    }
  }

  async handleRequest(
    service: string,
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<{ success: boolean; result?: unknown; error?: { code: string; message: string } }> {
    const bridge = this.services.get(service);

    if (!bridge) {
      return {
        success: false,
        error: { code: 'SERVICE_NOT_FOUND', message: `Service '${service}' not available` }
      };
    }

    try {
      const result = await bridge.send({ cmd: method, ...params }, timeoutMs);
      return { success: true, result };
    } catch (err) {
      return {
        success: false,
        error: { code: 'SERVICE_ERROR', message: String(err) }
      };
    }
  }

  getAvailableServices(): string[] {
    return Array.from(this.services.keys());
  }

  async shutdown(): Promise<void> {
    for (const [name, bridge] of this.services) {
      await bridge.disconnect();
      serviceLog.info(`Service disconnected: ${name}`);
    }
    this.services.clear();
  }
}
```

### Router Extension

Handle SERVICE_REQUEST messages:

```typescript
// Addition to src/daemon/router.ts

handleServiceRequest(
  from: RoutableConnection,
  envelope: Envelope<ServiceRequestPayload>
): void {
  const { service, method, params, timeout_ms } = envelope.payload;
  const requestId = envelope.id;

  this.serviceManager.handleRequest(service, method, params, timeout_ms ?? 30000)
    .then(result => {
      const response: Envelope<ServiceResponsePayload> = {
        v: PROTOCOL_VERSION,
        type: 'SERVICE_RESPONSE',
        id: uuid(),
        ts: Date.now(),
        from: service,
        to: from.agentName,
        payload: {
          request_id: requestId,
          ...result
        }
      };
      from.send(response);
    });
}
```

## Agent-Facing Interface

### Pattern-Based Access

Agents query tldr using a familiar pattern:

```
->relay:tldr semantic "validate authentication tokens"
->relay:tldr context src/auth/jwt.ts --depth 3
->relay:tldr impact handleLogin
->relay:tldr calls processPayment --direction callers
```

### Output Parser Extension

Update `src/wrapper/parser.ts` to recognize service calls:

```typescript
// Extend RELAY_PATTERN to capture service commands
const SERVICE_PATTERN = /^->relay:(tldr)\s+(\w+)\s+(.*)$/;

export function parseServiceCall(line: string): ServiceCall | null {
  const match = line.match(SERVICE_PATTERN);
  if (!match) return null;

  const [, service, method, argsString] = match;
  const params = parseServiceArgs(argsString);

  return { service, method, params };
}

function parseServiceArgs(argsString: string): Record<string, unknown> {
  // Handle quoted strings, --flags, positional args
  const params: Record<string, unknown> = {};
  const tokens = tokenize(argsString);

  let positionalIndex = 0;
  const positionalNames = ['query', 'target', 'path']; // First positional mapped to these

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = tokens[++i];
      params[key] = value === 'true' ? true : value === 'false' ? false : value;
    } else {
      params[positionalNames[positionalIndex++] || `arg${positionalIndex}`] = token;
    }
  }

  return params;
}
```

## Response Injection

Service responses are injected into the agent's context:

```typescript
// src/wrapper/tmux-wrapper.ts

async injectServiceResponse(response: ServiceResponsePayload): Promise<void> {
  let formatted: string;

  if (!response.success) {
    formatted = `[tldr error] ${response.error?.message}`;
  } else {
    // Format based on response type
    formatted = this.formatTldrResponse(response.result);
  }

  await this.injectMessage('tldr', formatted);
}

private formatTldrResponse(result: unknown): string {
  if (typeof result === 'string') return result;

  // Structured response formatting
  if (Array.isArray(result)) {
    // Semantic search results
    return result.map((r: any) =>
      `${r.file}:${r.line} ${r.signature} (${(r.score * 100).toFixed(0)}%)`
    ).join('\n');
  }

  // Context/impact results
  return JSON.stringify(result, null, 2);
}
```

## Configuration

### Daemon Config Extension

```typescript
// src/daemon/server.ts

export interface DaemonConfig extends ConnectionConfig {
  // ... existing fields

  /** Service configurations */
  services?: {
    tldr?: {
      enabled: boolean;
      socketPath?: string;  // Default: /tmp/tldr.sock
      autoStart?: boolean;  // Start tldr daemon if not running
    };
  };
}
```

### Environment Variables

```bash
# Enable tldr integration
AGENT_RELAY_TLDR_ENABLED=true
AGENT_RELAY_TLDR_SOCKET=/tmp/tldr.sock

# Or via config file
# ~/.config/agent-relay/services.json
{
  "services": [
    {
      "name": "tldr",
      "type": "tldr",
      "enabled": true,
      "socketPath": "/tmp/tldr.sock"
    }
  ]
}
```

## Startup Integration

### Auto-Discovery

Check for running tldr daemon at relay startup:

```typescript
// src/daemon/server.ts

async initServices(): Promise<void> {
  // Check if tldr daemon is running
  const tldrSocket = this.config.services?.tldr?.socketPath ?? '/tmp/tldr.sock';

  if (fs.existsSync(tldrSocket)) {
    try {
      await this.serviceManager.initialize();
      log.info('tldr service available');
    } catch (err) {
      log.warn('tldr daemon found but connection failed', { error: String(err) });
    }
  } else if (this.config.services?.tldr?.autoStart) {
    // Optionally spawn tldr daemon
    await this.spawnTldrDaemon();
  }
}
```

### Continuity Hook Integration

Inject tldr context at session start:

```typescript
// src/continuity/formatter.ts

async function formatStartupContext(
  trajectory: Trajectory,
  serviceManager?: ServiceManager
): Promise<string> {
  let context = formatTrajectory(trajectory);

  // Add tldr insights if available
  if (serviceManager?.getAvailableServices().includes('tldr')) {
    const tldr = serviceManager.getTldrBridge();

    // Get structure overview
    const structure = await tldr.structure();
    context += `\n## Codebase Structure (via tldr)\n${formatStructure(structure)}\n`;

    // Get context for task entry point if known
    if (trajectory.entryPoint) {
      const entryContext = await tldr.context(trajectory.entryPoint, 2);
      context += `\n## Entry Point Context\n${formatContext(entryContext)}\n`;
    }

    // Semantic search for task description
    if (trajectory.description) {
      const related = await tldr.semantic(trajectory.description, 5);
      context += `\n## Related Code\n${formatSearchResults(related)}\n`;
    }
  }

  return context;
}
```

## Error Handling

### Graceful Degradation

```typescript
// When tldr unavailable, provide helpful fallback

async handleTldrUnavailable(method: string, params: Record<string, unknown>): Promise<string> {
  const fallbacks: Record<string, string> = {
    semantic: `tldr unavailable. Try: grep -r "${params.query}" --include="*.ts"`,
    context: `tldr unavailable. Try: cat ${params.target}`,
    impact: `tldr unavailable. Try: grep -r "${params.target}" --include="*.ts"`,
    calls: `tldr unavailable. Try: grep -r "${params.target}" --include="*.ts"`,
  };

  return fallbacks[method] || 'tldr service unavailable';
}
```

### Retry Logic

```typescript
// Reconnect on transient failures

async sendWithRetry(
  command: TldrCommand,
  timeoutMs: number,
  maxRetries = 3
): Promise<TldrResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await this.send(command, timeoutMs);
    } catch (err) {
      lastError = err as Error;

      if (err.message.includes('Connection closed')) {
        // Reconnect and retry
        await this.connect();
        continue;
      }

      throw err; // Non-retryable error
    }
  }

  throw lastError;
}
```

## Performance Considerations

### Latency Budget

| Operation | Target | Notes |
|-----------|--------|-------|
| Socket connect | <10ms | Unix socket, same machine |
| Semantic search | <100ms | FAISS in-memory index |
| Context generation | <50ms | Cached call graphs |
| Full round-trip | <150ms | Parse + route + query + format |

### Caching Layer

```typescript
// src/services/tldr-cache.ts

export class TldrCache {
  private cache: Map<string, { result: unknown; timestamp: number }> = new Map();
  private ttlMs: number;

  constructor(ttlMs = 60000) { // 1 minute default
    this.ttlMs = ttlMs;
  }

  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  set(key: string, result: unknown): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### File Watcher Integration

Invalidate cache on file changes:

```typescript
// Integrate with existing workspace-manager.ts

onFileChange(path: string): void {
  // Invalidate tldr cache for affected files
  this.serviceManager.getTldrCache()?.invalidate(path);

  // Notify tldr to re-index if needed
  this.serviceManager.getTldrBridge()?.send({
    cmd: 'invalidate',
    path
  }).catch(() => {}); // Best-effort
}
```

## Implementation Phases

### Phase 1: Bridge Foundation (Week 1)
- [ ] Create `TldrBridge` class
- [ ] Add `ServiceManager` to daemon
- [ ] Handle SERVICE_REQUEST/SERVICE_RESPONSE messages
- [ ] Basic error handling

### Phase 2: Agent Interface (Week 2)
- [ ] Extend output parser for service patterns
- [ ] Response injection formatting
- [ ] Documentation for agent usage

### Phase 3: Continuity Integration (Week 3)
- [ ] Startup context enrichment
- [ ] Automatic semantic search for task context
- [ ] Entry point analysis

### Phase 4: Polish (Week 4)
- [ ] Caching layer
- [ ] File watcher integration
- [ ] Retry logic and resilience
- [ ] Metrics and observability

## Testing Strategy

### Unit Tests

```typescript
// src/services/tldr-bridge.test.ts

describe('TldrBridge', () => {
  it('sends commands and receives responses', async () => {
    const bridge = new TldrBridge('/tmp/test-tldr.sock');
    await bridge.connect();

    const result = await bridge.semantic('authentication');
    expect(result.success).toBe(true);
    expect(result.result).toBeInstanceOf(Array);
  });

  it('handles timeout gracefully', async () => {
    const bridge = new TldrBridge('/tmp/test-tldr.sock');
    await bridge.connect();

    await expect(bridge.send({ cmd: 'slow' }, 100))
      .rejects.toThrow('Timeout');
  });
});
```

### Integration Tests

```typescript
// test/integration/tldr-integration.test.ts

describe('tldr integration', () => {
  it('agents can query semantic search', async () => {
    const daemon = new Daemon({ services: { tldr: { enabled: true } } });
    await daemon.start();

    const agent = await connectAgent('test-agent');

    // Simulate agent output
    await agent.sendServiceRequest('tldr', 'semantic', { query: 'auth' });

    const response = await agent.waitForServiceResponse();
    expect(response.success).toBe(true);
  });
});
```

## Security Considerations

1. **Socket Permissions**: Both sockets use 0o600 (owner-only)
2. **No Network Exposure**: Unix sockets only, same-machine communication
3. **Input Validation**: Sanitize method names and parameters
4. **Resource Limits**: Timeout all requests, limit result sizes

## Alternatives Considered

### Alternative 1: MCP Integration
- **Pros**: Standard protocol, existing ecosystem
- **Cons**: HTTP overhead (50-200ms), external dependency
- **Decision**: Direct socket faster and simpler for local use case

### Alternative 2: Shared Memory
- **Pros**: Lowest latency possible
- **Cons**: Complex synchronization, platform-specific
- **Decision**: Unix sockets sufficient for target latency

### Alternative 3: Embedded tldr
- **Pros**: No IPC overhead
- **Cons**: Python/Node bridge complexity, memory footprint
- **Decision**: Separate processes better for isolation

## Success Metrics

1. **Latency**: P95 service call < 150ms
2. **Token Savings**: Measured reduction in file reads after integration
3. **Adoption**: % of agent sessions using tldr queries
4. **Reliability**: Service availability > 99.9%

## Open Questions

1. Should we support multiple tldr instances (per-project)?
2. How to handle tldr index building (sync vs async)?
3. Should service responses be persisted to message history?
4. Rate limiting for expensive queries (full codebase analysis)?

## Appendix: tldr Protocol Reference

Based on llm-tldr source analysis:

```
# Commands (JSON over Unix socket, newline-delimited)

{ "cmd": "semantic", "query": "string", "limit": 10 }
{ "cmd": "context", "target": "path/file.ts:func", "depth": 2 }
{ "cmd": "impact", "target": "functionName", "depth": 3 }
{ "cmd": "calls", "target": "functionName", "direction": "callers|callees" }
{ "cmd": "structure", "path": "optional/subdir" }
{ "cmd": "extract", "symbol": "ClassName.method" }
{ "cmd": "cfg", "target": "functionName" }
{ "cmd": "dfg", "target": "functionName" }
{ "cmd": "slice", "target": "file.ts:42", "variable": "x" }

# Response format
{ "success": true, "result": <varies by command> }
{ "success": false, "error": "error message" }
```

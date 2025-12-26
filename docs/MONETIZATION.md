# Agent Relay Monetization Strategy

> RFC: Open Core Model with Tiered Features

**Status**: Draft
**Author**: Khaliq Gant
**Created**: 2025-12-26
**Last Updated**: 2025-12-26

---

## Executive Summary

This document outlines a monetization strategy for Agent Relay using an **Open Core** model. The core messaging functionality remains MIT-licensed and free, while premium features targeting teams and enterprises are offered through paid tiers.

### Recommended Pricing Tiers

| Tier | Price | Target User |
|------|-------|-------------|
| **Community** | Free | Individual developers, OSS projects |
| **Pro** | $29-49/month per machine | Professional developers, small teams |
| **Team** | $99-199/month | Engineering teams, multi-machine setups |
| **Enterprise** | Custom | Large organizations, compliance needs |

---

## Table of Contents

1. [Market Analysis](#1-market-analysis)
2. [Feature Matrix](#2-feature-matrix)
3. [Technical Specifications](#3-technical-specifications)
   - [3.1 Licensing System](#31-licensing-system)
   - [3.2 Authentication & API Keys](#32-authentication--api-keys)
   - [3.3 TLS Encryption](#33-tls-encryption)
   - [3.4 Scale Optimizations](#34-scale-optimizations)
   - [3.5 Message Retention](#35-message-retention)
   - [3.6 Webhooks](#36-webhooks)
4. [Implementation Roadmap](#4-implementation-roadmap)
5. [Pricing Justification](#5-pricing-justification)
6. [Risks & Mitigations](#6-risks--mitigations)

---

## 1. Market Analysis

### Target Users

| Segment | Size | Willingness to Pay | Key Needs |
|---------|------|-------------------|-----------|
| **Hobbyists** | Large | Low | Free, easy setup |
| **Indie Developers** | Medium | Medium | Reliability, simple pricing |
| **Startups** | Medium | Medium-High | Scale, integrations |
| **Enterprise** | Small | High | Security, compliance, support |

### Competitive Landscape

| Competitor | Model | Price Range | Differentiator |
|-----------|-------|-------------|----------------|
| LangGraph | Open Core | Free - $500/mo | Workflow orchestration |
| CrewAI | SaaS | Free - Custom | Pre-built agent roles |
| AutoGen | MIT (Microsoft) | Free | Deep MS integration |
| **Agent Relay** | Open Core | Free - Custom | Real-time messaging, CLI-native |

### Our Advantages

1. **Zero-modification integration**: Works with any CLI agent via output patterns
2. **Sub-5ms latency**: Unix socket architecture
3. **Simple mental model**: Relay messaging, not workflow orchestration
4. **Composable**: Works alongside other tools (Mimir, Beads, etc.)

---

## 2. Feature Matrix

### Community Tier (Free)

| Feature | Limit | Notes |
|---------|-------|-------|
| Agents | 10 | Per daemon instance |
| Message throughput | 100 msg/sec | Soft limit |
| Message retention | 7 days | SQLite storage |
| Dashboard | Basic | Real-time view |
| Storage | SQLite only | Local file |
| Transport | Unix socket | Single machine |
| Support | Community | GitHub issues |

### Pro Tier ($29-49/month)

| Feature | Limit | Notes |
|---------|-------|-------|
| Agents | 100 | Per daemon instance |
| Message throughput | 1,000 msg/sec | Optimized routing |
| Message retention | 90 days | Configurable |
| Dashboard | Enhanced | Metrics, analytics |
| **Authentication** | API keys | Per-agent keys |
| **TLS encryption** | Full | Socket + storage |
| **Webhooks** | 10 endpoints | HTTP callbacks |
| Support | Email | 48hr response |

### Team Tier ($99-199/month)

| Feature | Limit | Notes |
|---------|-------|-------|
| Agents | 500 | Across machines |
| Message throughput | 5,000 msg/sec | Distributed |
| Message retention | 365 days | Configurable |
| **Multi-machine** | TCP transport | Cluster mode |
| **Team dashboard** | Shared | Role-based access |
| **Audit logs** | Full | Compliance-ready |
| **SSO** | SAML/OIDC | GitHub, Google, Okta |
| Support | Priority | 24hr response |

### Enterprise Tier (Custom)

| Feature | Limit | Notes |
|---------|-------|-------|
| Agents | Unlimited | - |
| Message throughput | Unlimited | - |
| Message retention | Unlimited | - |
| **Air-gapped** | Offline license | No phone-home |
| **Compliance** | SOC2, HIPAA | Documentation |
| **Custom SLA** | 99.9%+ | Contractual |
| **Dedicated support** | Slack/Teams | 4hr response |
| **Custom features** | 2/year | Built to spec |

---

## 3. Technical Specifications

### 3.1 Licensing System

#### Overview

A lightweight license validation system that:
- Validates license keys on daemon startup
- Enforces feature gates at runtime
- Tracks usage for billing (optional telemetry)
- Supports offline/air-gapped mode for Enterprise

#### Architecture

```
src/
  licensing/
    index.ts              # Public API
    license-validator.ts  # Key validation
    feature-flags.ts      # Feature gating
    usage-tracker.ts      # Telemetry (opt-in)
    offline-license.ts    # Air-gapped support
```

#### License Key Format

```
ar_[tier]_[random]_[checksum]

Examples:
ar_pro_a1b2c3d4e5f6g7h8_x9y0
ar_team_k8j7h6g5f4d3s2a1_m3n4
ar_ent_q1w2e3r4t5y6u7i8_p9o0
```

#### Validation Flow

```typescript
interface LicenseInfo {
  key: string;
  tier: 'community' | 'pro' | 'team' | 'enterprise';
  validUntil: Date;
  features: string[];
  limits: {
    maxAgents: number;
    maxMessagesPerSecond: number;
    retentionDays: number;
  };
  offline?: boolean;  // Enterprise air-gapped
}

async function validateLicense(key: string): Promise<LicenseInfo> {
  // 1. Check local cache
  const cached = await licenseCache.get(key);
  if (cached && !isExpired(cached)) {
    return cached;
  }

  // 2. Validate with license server (unless offline mode)
  if (!isOfflineLicense(key)) {
    const remote = await fetchLicense(key);
    await licenseCache.set(key, remote);
    return remote;
  }

  // 3. Validate offline license signature
  return validateOfflineLicense(key);
}
```

#### Feature Flags

```typescript
// licensing/feature-flags.ts

export const TIER_FEATURES = {
  community: [
    'basic_messaging',
    'dashboard_basic',
    'sqlite_storage',
  ],
  pro: [
    // Includes all community features
    'authentication',
    'api_keys',
    'tls_encryption',
    'storage_encryption',
    'extended_retention',
    'webhooks',
    'high_throughput',
    'dashboard_metrics',
  ],
  team: [
    // Includes all pro features
    'multi_machine',
    'tcp_transport',
    'team_dashboard',
    'role_based_access',
    'audit_logs',
    'sso_saml',
    'sso_oidc',
  ],
  enterprise: [
    // Includes all team features
    'unlimited_retention',
    'offline_license',
    'custom_sla',
    'dedicated_support',
  ],
} as const;

export function hasFeature(tier: string, feature: string): boolean {
  const tierIndex = ['community', 'pro', 'team', 'enterprise'].indexOf(tier);

  for (let i = tierIndex; i >= 0; i--) {
    const tierName = ['community', 'pro', 'team', 'enterprise'][i];
    if (TIER_FEATURES[tierName].includes(feature)) {
      return true;
    }
  }

  return false;
}
```

#### Database Schema

```sql
-- License tracking (local cache)
CREATE TABLE license_cache (
  key_hash TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  valid_until INTEGER NOT NULL,
  features TEXT NOT NULL,       -- JSON array
  limits TEXT NOT NULL,         -- JSON object
  cached_at INTEGER NOT NULL
);

-- Usage tracking (for metered billing, opt-in)
CREATE TABLE usage_daily (
  date TEXT NOT NULL,           -- '2025-01-15'
  metric TEXT NOT NULL,         -- 'agents_peak', 'messages_sent'
  value INTEGER NOT NULL,
  PRIMARY KEY (date, metric)
);
```

---

### 3.2 Authentication & API Keys

#### Overview

Pro tier adds optional authentication:
- API keys for programmatic access
- Per-agent identity verification
- Key rotation and revocation
- Usage tracking per key

#### Protocol Changes

**HELLO payload extension** (`protocol/types.ts`):

```typescript
export interface HelloPayload {
  agent: string;
  capabilities: { ... };

  // NEW: Authentication
  auth?: {
    type: 'api_key' | 'token';
    credential: string;
  };

  // Existing optional fields
  cli?: string;
  program?: string;
  model?: string;
}
```

**WELCOME payload extension**:

```typescript
export interface WelcomePayload {
  session_id: string;
  server: { ... };

  // NEW: License info
  license?: {
    tier: string;
    features: string[];
    limits: {
      maxAgents: number;
      retentionDays: number;
    };
  };
}
```

**New ERROR codes**:

```typescript
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'      // Missing or invalid credentials
  | 'FORBIDDEN'         // Valid credentials, insufficient permissions
  | 'QUOTA_EXCEEDED'    // Agent/message limit reached
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'RESUME_TOO_OLD';
```

#### API Key Management

**Database schema**:

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,   -- SHA256(key)
  key_prefix TEXT NOT NULL,        -- First 8 chars for display
  name TEXT NOT NULL,
  description TEXT,

  -- Permissions
  scopes TEXT NOT NULL DEFAULT '["send","receive"]',  -- JSON array
  allowed_agents TEXT,             -- JSON array, null = all

  -- Limits
  rate_limit_per_minute INTEGER DEFAULT 1000,

  -- Metadata
  created_at INTEGER NOT NULL,
  created_by TEXT,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,

  -- Usage counters (updated periodically)
  total_messages INTEGER DEFAULT 0
);

CREATE INDEX idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_expires ON api_keys (expires_at) WHERE revoked_at IS NULL;
```

**Key generation**:

```typescript
// licensing/api-keys.ts

import crypto from 'crypto';

export interface ApiKeyCreate {
  name: string;
  description?: string;
  scopes?: ('send' | 'receive' | 'admin')[];
  allowedAgents?: string[];
  expiresIn?: number;  // milliseconds
}

export interface ApiKey {
  id: string;
  key: string;         // Only returned on creation
  keyPrefix: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Format: ar_key_[32 random chars]
  const random = crypto.randomBytes(24).toString('base64url');
  const key = `ar_key_${random}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 15);  // 'ar_key_XXXXXXX'

  return { key, hash, prefix };
}

export async function createApiKey(
  storage: StorageAdapter,
  options: ApiKeyCreate
): Promise<ApiKey> {
  const { key, hash, prefix } = generateApiKey();
  const id = crypto.randomUUID();
  const now = Date.now();

  await storage.exec(`
    INSERT INTO api_keys (id, key_hash, key_prefix, name, description, scopes, allowed_agents, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    hash,
    prefix,
    options.name,
    options.description || null,
    JSON.stringify(options.scopes || ['send', 'receive']),
    options.allowedAgents ? JSON.stringify(options.allowedAgents) : null,
    now,
    options.expiresIn ? now + options.expiresIn : null,
  ]);

  return {
    id,
    key,  // Only time the full key is available
    keyPrefix: prefix,
    name: options.name,
    scopes: options.scopes || ['send', 'receive'],
    createdAt: new Date(now),
    expiresAt: options.expiresIn ? new Date(now + options.expiresIn) : undefined,
  };
}

export async function validateApiKey(
  storage: StorageAdapter,
  key: string
): Promise<{ valid: boolean; reason?: string; keyInfo?: any }> {
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  const row = await storage.get(`
    SELECT * FROM api_keys
    WHERE key_hash = ? AND revoked_at IS NULL
  `, [hash]);

  if (!row) {
    return { valid: false, reason: 'Invalid API key' };
  }

  if (row.expires_at && row.expires_at < Date.now()) {
    return { valid: false, reason: 'API key expired' };
  }

  // Update last used
  await storage.exec(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, [Date.now(), row.id]);

  return {
    valid: true,
    keyInfo: {
      id: row.id,
      name: row.name,
      scopes: JSON.parse(row.scopes),
      allowedAgents: row.allowed_agents ? JSON.parse(row.allowed_agents) : null,
    },
  };
}
```

#### Connection Authentication

**Changes to `daemon/connection.ts`**:

```typescript
// connection.ts - handleHello method

private async handleHello(envelope: Envelope<HelloPayload>): Promise<void> {
  if (this._state !== 'HANDSHAKING') {
    this.sendError('BAD_REQUEST', 'Unexpected HELLO', false);
    return;
  }

  // Check if authentication is required
  if (this.config.requireAuth) {
    const auth = envelope.payload.auth;

    if (!auth) {
      this.sendError('UNAUTHORIZED', 'Authentication required', true);
      this.close();
      return;
    }

    const validation = await this.authProvider.validate(auth);

    if (!validation.valid) {
      this.sendError('UNAUTHORIZED', validation.reason || 'Invalid credentials', true);
      this.close();
      return;
    }

    // Store auth context for permission checks
    this._authContext = validation.context;

    // Check if this agent name is allowed
    if (validation.context.allowedAgents) {
      if (!validation.context.allowedAgents.includes(envelope.payload.agent)) {
        this.sendError('FORBIDDEN', `Agent name "${envelope.payload.agent}" not allowed for this key`, true);
        this.close();
        return;
      }
    }
  }

  // Check agent limit
  const currentAgents = this.getAgentCount();
  const maxAgents = this._license?.limits.maxAgents ?? 10;

  if (currentAgents >= maxAgents) {
    this.sendError('QUOTA_EXCEEDED', `Agent limit reached (${maxAgents}). Upgrade to increase limit.`, true);
    this.close();
    return;
  }

  // Continue with existing logic...
  this._agentName = envelope.payload.agent;
  // ...
}
```

#### Dashboard API

**New endpoints in `dashboard/server.ts`**:

```typescript
// Require Pro tier for API key management
const requirePro = (req, res, next) => {
  if (!license || !hasFeature(license.tier, 'api_keys')) {
    return res.status(403).json({ error: 'Pro tier required for API key management' });
  }
  next();
};

// List API keys (without full key values)
app.get('/api/keys', requirePro, async (req, res) => {
  const keys = await storage.all(`
    SELECT id, key_prefix, name, description, scopes, created_at, last_used_at, expires_at
    FROM api_keys
    WHERE revoked_at IS NULL
    ORDER BY created_at DESC
  `);

  res.json({
    keys: keys.map(k => ({
      id: k.id,
      keyPrefix: k.key_prefix,
      name: k.name,
      description: k.description,
      scopes: JSON.parse(k.scopes),
      createdAt: new Date(k.created_at).toISOString(),
      lastUsedAt: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
      expiresAt: k.expires_at ? new Date(k.expires_at).toISOString() : null,
    })),
  });
});

// Create new API key
app.post('/api/keys', requirePro, async (req, res) => {
  const { name, description, scopes, allowedAgents, expiresInDays } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const apiKey = await createApiKey(storage, {
    name,
    description,
    scopes,
    allowedAgents,
    expiresIn: expiresInDays ? expiresInDays * 24 * 60 * 60 * 1000 : undefined,
  });

  // Return full key only on creation
  res.json({
    id: apiKey.id,
    key: apiKey.key,  // IMPORTANT: Only shown once
    keyPrefix: apiKey.keyPrefix,
    name: apiKey.name,
    message: 'Save this key now. It will not be shown again.',
  });
});

// Revoke API key
app.delete('/api/keys/:id', requirePro, async (req, res) => {
  const { id } = req.params;

  await storage.exec(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`, [Date.now(), id]);

  res.json({ success: true });
});
```

---

### 3.3 TLS Encryption

#### Overview

Pro tier adds optional TLS encryption for:
- Socket transport (daemon ↔ client)
- SQLite storage (at-rest encryption)

#### Socket TLS

**Configuration** (`daemon/server.ts`):

```typescript
export interface TlsConfig {
  enabled: boolean;
  certPath: string;       // PEM certificate
  keyPath: string;        // PEM private key
  caPath?: string;        // CA for client verification (mTLS)
  mutualTls?: boolean;    // Require client certificates
}

export interface DaemonConfig extends ConnectionConfig {
  socketPath: string;
  pidFilePath: string;
  storagePath?: string;

  // NEW
  tls?: TlsConfig;
}
```

**Server implementation**:

```typescript
// daemon/server.ts

import tls from 'node:tls';

constructor(config: Partial<DaemonConfig> = {}) {
  this.config = { ...DEFAULT_DAEMON_CONFIG, ...config };

  // Validate TLS config requires Pro tier
  if (this.config.tls?.enabled && !hasFeature(this.license?.tier, 'tls_encryption')) {
    throw new Error('TLS encryption requires Pro tier');
  }

  if (this.config.tls?.enabled) {
    const tlsOptions: tls.TlsOptions = {
      key: fs.readFileSync(this.config.tls.keyPath),
      cert: fs.readFileSync(this.config.tls.certPath),
    };

    if (this.config.tls.mutualTls) {
      tlsOptions.requestCert = true;
      tlsOptions.rejectUnauthorized = true;
      if (this.config.tls.caPath) {
        tlsOptions.ca = [fs.readFileSync(this.config.tls.caPath)];
      }
    }

    this.server = tls.createServer(tlsOptions, this.handleConnection.bind(this));
    console.log('[daemon] TLS enabled');
  } else {
    this.server = net.createServer(this.handleConnection.bind(this));
  }
}
```

**Client implementation** (`wrapper/client.ts`):

```typescript
export interface ClientTlsConfig {
  enabled: boolean;
  caPath?: string;           // CA to verify server
  clientCertPath?: string;   // For mTLS
  clientKeyPath?: string;    // For mTLS
  rejectUnauthorized?: boolean;
}

export interface ClientConfig {
  // ... existing
  tls?: ClientTlsConfig;
}

connect(): Promise<void> {
  // ...

  const connectCallback = () => {
    this.setState('HANDSHAKING');
    this.sendHello();
  };

  if (this.config.tls?.enabled) {
    const tlsOptions: tls.ConnectionOptions = {
      rejectUnauthorized: this.config.tls.rejectUnauthorized ?? true,
    };

    if (this.config.tls.caPath) {
      tlsOptions.ca = [fs.readFileSync(this.config.tls.caPath)];
    }

    if (this.config.tls.clientCertPath && this.config.tls.clientKeyPath) {
      tlsOptions.cert = fs.readFileSync(this.config.tls.clientCertPath);
      tlsOptions.key = fs.readFileSync(this.config.tls.clientKeyPath);
    }

    this.socket = tls.connect(this.config.socketPath, tlsOptions, connectCallback);
  } else {
    this.socket = net.createConnection(this.config.socketPath, connectCallback);
  }

  // ...
}
```

#### Storage Encryption

**Using SQLCipher or better-sqlite3 encryption**:

```typescript
// storage/sqlite-adapter.ts

export interface SqliteAdapterOptions {
  dbPath: string;
  messageRetentionMs?: number;
  cleanupIntervalMs?: number;

  // NEW
  encryptionKey?: string;  // Pro tier
}

private async openDatabase(driver: SqliteDriverName): Promise<SqliteDatabase> {
  if (driver === 'better-sqlite3') {
    const mod = await import('better-sqlite3');
    const DatabaseCtor: any = (mod as any).default ?? mod;
    const db: any = new DatabaseCtor(this.dbPath);

    // Enable encryption if key provided
    if (this.encryptionKey) {
      if (!hasFeature(this.licenseTier, 'storage_encryption')) {
        throw new Error('Storage encryption requires Pro tier');
      }

      // SQLCipher compatible
      db.pragma(`key = '${this.encryptionKey}'`);

      // Verify encryption is working
      try {
        db.pragma('cipher_version');
      } catch (e) {
        throw new Error('SQLCipher not available. Install better-sqlite3 with SQLCipher support.');
      }
    }

    db.pragma('journal_mode = WAL');
    return db;
  }

  // ... node:sqlite fallback
}
```

**CLI integration**:

```bash
# Generate encryption key
agent-relay keygen --output ~/.agent-relay/db.key

# Start with encryption
agent-relay up --db-key ~/.agent-relay/db.key

# Or via environment
export AGENT_RELAY_DB_KEY=$(cat ~/.agent-relay/db.key)
agent-relay up
```

---

### 3.4 Scale Optimizations

#### Overview

Pro tier enables optimizations for high-throughput scenarios:
- Batched message persistence
- Connection pooling
- Worker thread offloading

#### Batched Persistence

**Current problem**: Each message is persisted synchronously, blocking the router.

**Solution**: Batch writes with configurable flush interval.

```typescript
// router.ts

export interface RouterOptions {
  storage?: StorageAdapter;
  registry?: AgentRegistry;
  delivery?: Partial<DeliveryReliabilityOptions>;

  // NEW: Pro tier optimizations
  batchPersistence?: {
    enabled: boolean;
    flushIntervalMs: number;   // Default: 50ms
    maxBatchSize: number;      // Default: 100
  };
}

export class Router {
  private pendingPersist: DeliverEnvelope[] = [];
  private persistTimer?: NodeJS.Timeout;
  private batchConfig: Required<RouterOptions['batchPersistence']>;

  constructor(options: RouterOptions = {}) {
    // ...

    this.batchConfig = {
      enabled: options.batchPersistence?.enabled ?? false,
      flushIntervalMs: options.batchPersistence?.flushIntervalMs ?? 50,
      maxBatchSize: options.batchPersistence?.maxBatchSize ?? 100,
    };
  }

  private persistDeliverEnvelope(envelope: DeliverEnvelope): void {
    if (!this.storage) return;

    if (this.batchConfig.enabled) {
      this.queuePersist(envelope);
    } else {
      // Original sync behavior
      this.storage.saveMessage({...}).catch(console.error);
    }
  }

  private queuePersist(envelope: DeliverEnvelope): void {
    this.pendingPersist.push(envelope);

    // Flush immediately if batch is full
    if (this.pendingPersist.length >= this.batchConfig.maxBatchSize) {
      this.flushPersist();
      return;
    }

    // Schedule flush
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.flushPersist();
      }, this.batchConfig.flushIntervalMs);
    }
  }

  private async flushPersist(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }

    const batch = this.pendingPersist;
    this.pendingPersist = [];

    if (batch.length === 0) return;

    const messages = batch.map(e => ({
      id: e.id,
      ts: e.ts,
      from: e.from ?? 'unknown',
      to: e.to ?? 'unknown',
      topic: e.topic,
      kind: e.payload.kind,
      body: e.payload.body,
      data: e.payload.data,
      thread: e.payload.thread,
      deliverySeq: e.delivery.seq,
      deliverySessionId: e.delivery.session_id,
      sessionId: e.delivery.session_id,
      status: 'unread' as const,
      is_urgent: false,
    }));

    try {
      await this.storage!.saveMessageBatch(messages);
    } catch (err) {
      console.error('[router] Batch persist failed:', err);
      // Re-queue failed batch (with limit to prevent infinite growth)
      if (this.pendingPersist.length < 1000) {
        this.pendingPersist.unshift(...batch);
      }
    }
  }
}
```

**SQLite batch insert**:

```typescript
// storage/sqlite-adapter.ts

async saveMessageBatch(messages: StoredMessage[]): Promise<void> {
  if (!this.db) throw new Error('Not initialized');

  const stmt = this.db.prepare(`
    INSERT OR REPLACE INTO messages
    (id, ts, sender, recipient, topic, kind, body, data, thread, delivery_seq, delivery_session_id, session_id, status, is_urgent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Use transaction for atomicity and performance
  this.db.exec('BEGIN TRANSACTION');
  try {
    for (const msg of messages) {
      stmt.run(
        msg.id, msg.ts, msg.from, msg.to, msg.topic ?? null,
        msg.kind, msg.body, msg.data ? JSON.stringify(msg.data) : null,
        msg.thread ?? null, msg.deliverySeq ?? null, msg.deliverySessionId ?? null,
        msg.sessionId ?? null, msg.status, msg.is_urgent ? 1 : 0
      );
    }
    this.db.exec('COMMIT');
  } catch (err) {
    this.db.exec('ROLLBACK');
    throw err;
  }
}
```

#### Rate Limiting

**Per-connection rate limiting**:

```typescript
// daemon/connection.ts

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

private rateLimit: RateLimitState = {
  tokens: 100,  // Messages per second
  lastRefill: Date.now(),
};

private checkRateLimit(): boolean {
  const now = Date.now();
  const elapsed = now - this.rateLimit.lastRefill;

  // Refill tokens (1 token per 10ms = 100/sec)
  const refill = Math.floor(elapsed / 10);
  if (refill > 0) {
    this.rateLimit.tokens = Math.min(100, this.rateLimit.tokens + refill);
    this.rateLimit.lastRefill = now;
  }

  if (this.rateLimit.tokens <= 0) {
    return false;
  }

  this.rateLimit.tokens--;
  return true;
}

private handleSend(envelope: Envelope<SendPayload>): void {
  if (this._state !== 'ACTIVE') {
    this.sendError('BAD_REQUEST', 'Not in ACTIVE state', false);
    return;
  }

  // Check rate limit
  if (!this.checkRateLimit()) {
    this.send({
      v: PROTOCOL_VERSION,
      type: 'BUSY',
      id: uuid(),
      ts: Date.now(),
      payload: {
        retry_after_ms: 100,
        queue_depth: 0,
      },
    });
    return;
  }

  // Forward to router
  if (this.onMessage) {
    this.onMessage(envelope);
  }
}
```

---

### 3.5 Message Retention

#### Overview

Configurable retention periods by tier:
- Community: 7 days (fixed)
- Pro: Up to 90 days
- Team: Up to 365 days
- Enterprise: Unlimited

#### Implementation

**Configuration**:

```typescript
// storage/sqlite-adapter.ts

const RETENTION_LIMITS = {
  community: 7 * 24 * 60 * 60 * 1000,      // 7 days
  pro: 90 * 24 * 60 * 60 * 1000,           // 90 days
  team: 365 * 24 * 60 * 60 * 1000,         // 365 days
  enterprise: Infinity,                     // Unlimited
};

export interface SqliteAdapterOptions {
  dbPath: string;
  messageRetentionMs?: number;
  cleanupIntervalMs?: number;
  licenseTier?: string;
}

constructor(options: SqliteAdapterOptions) {
  this.dbPath = options.dbPath;

  const tier = options.licenseTier || 'community';
  const maxRetention = RETENTION_LIMITS[tier] || RETENTION_LIMITS.community;

  // User can set lower retention, but not higher than tier allows
  this.retentionMs = Math.min(
    options.messageRetentionMs ?? RETENTION_LIMITS.community,
    maxRetention
  );

  this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
}
```

**CLI options**:

```bash
# Set retention (Pro tier example)
agent-relay up --retention 30d

# Query current retention
agent-relay status --verbose
# Output: Retention: 30 days (Pro tier max: 90 days)
```

---

### 3.6 Webhooks

#### Overview

Pro tier enables HTTP webhooks for external integrations:
- Message events (sent, delivered, failed)
- Agent events (connected, disconnected)
- System events (daemon started, stopped)

#### Architecture

```
src/
  webhooks/
    index.ts           # Public API
    manager.ts         # Registration and dispatch
    types.ts           # Event definitions
    queue.ts           # Async dispatch with retry
```

#### Event Types

```typescript
// webhooks/types.ts

export type WebhookEvent =
  // Message events
  | 'message.sent'
  | 'message.delivered'
  | 'message.failed'

  // Agent events
  | 'agent.connected'
  | 'agent.disconnected'

  // System events
  | 'system.started'
  | 'system.stopped';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: unknown;
}

export interface MessageSentPayload {
  id: string;
  from: string;
  to: string;
  preview: string;      // First 100 chars
  timestamp: string;
}

export interface AgentConnectedPayload {
  name: string;
  cli?: string;
  sessionId: string;
  timestamp: string;
}
```

#### Database Schema

```sql
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  events TEXT NOT NULL,           -- JSON array of event types
  secret TEXT,                    -- For HMAC signature
  description TEXT,

  -- Status
  enabled INTEGER DEFAULT 1,
  failure_count INTEGER DEFAULT 0,
  last_failure TEXT,              -- Error message
  last_success_at INTEGER,

  -- Metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,

  -- Delivery status
  status TEXT NOT NULL,           -- 'pending', 'success', 'failed'
  attempts INTEGER DEFAULT 0,
  last_attempt_at INTEGER,
  response_status INTEGER,
  response_body TEXT,
  error TEXT,

  created_at INTEGER NOT NULL,

  FOREIGN KEY (webhook_id) REFERENCES webhooks (id)
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries (status);
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id);
```

#### Webhook Manager

```typescript
// webhooks/manager.ts

import crypto from 'crypto';

export interface WebhookConfig {
  url: string;
  events: WebhookEvent[];
  secret?: string;
  description?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: unknown;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
}

export class WebhookManager {
  private storage: StorageAdapter;
  private queue: AsyncQueue<WebhookDelivery>;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
    this.queue = new AsyncQueue(this.deliverWebhook.bind(this), {
      concurrency: 5,
      retryAttempts: 3,
      retryDelayMs: 1000,
    });
  }

  async register(config: WebhookConfig): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.storage.exec(`
      INSERT INTO webhooks (id, url, events, secret, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      config.url,
      JSON.stringify(config.events),
      config.secret || null,
      config.description || null,
      now,
      now,
    ]);

    return id;
  }

  async dispatch(event: WebhookEvent, data: unknown): Promise<void> {
    // Find webhooks subscribed to this event
    const webhooks = await this.storage.all(`
      SELECT * FROM webhooks
      WHERE enabled = 1 AND events LIKE ?
    `, [`%"${event}"%`]);

    for (const webhook of webhooks) {
      const deliveryId = crypto.randomUUID();
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      };

      // Record delivery attempt
      await this.storage.exec(`
        INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `, [deliveryId, webhook.id, event, JSON.stringify(payload), Date.now()]);

      // Queue for async delivery
      this.queue.push({
        id: deliveryId,
        webhookId: webhook.id,
        event,
        payload,
        status: 'pending',
        attempts: 0,
      });
    }
  }

  private async deliverWebhook(delivery: WebhookDelivery): Promise<void> {
    const webhook = await this.storage.get(`SELECT * FROM webhooks WHERE id = ?`, [delivery.webhookId]);
    if (!webhook) return;

    const body = JSON.stringify(delivery.payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': delivery.event,
      'X-Webhook-Delivery': delivery.id,
    };

    // Add HMAC signature if secret is configured
    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),  // 10s timeout
      });

      await this.storage.exec(`
        UPDATE webhook_deliveries
        SET status = ?, attempts = attempts + 1, last_attempt_at = ?, response_status = ?
        WHERE id = ?
      `, [
        response.ok ? 'success' : 'failed',
        Date.now(),
        response.status,
        delivery.id,
      ]);

      if (response.ok) {
        await this.storage.exec(`
          UPDATE webhooks SET failure_count = 0, last_success_at = ? WHERE id = ?
        `, [Date.now(), webhook.id]);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      await this.storage.exec(`
        UPDATE webhooks SET failure_count = failure_count + 1, last_failure = ? WHERE id = ?
      `, [err.message, webhook.id]);

      await this.storage.exec(`
        UPDATE webhook_deliveries SET status = 'failed', error = ?, attempts = attempts + 1 WHERE id = ?
      `, [err.message, delivery.id]);

      throw err;  // Let queue handle retry
    }
  }
}
```

#### Integration Points

**Router integration** (`router.ts`):

```typescript
export class Router {
  private webhookManager?: WebhookManager;

  constructor(options: RouterOptions = {}) {
    // ...
    if (options.webhookManager) {
      this.webhookManager = options.webhookManager;
    }
  }

  private sendDirect(from: string, to: string, envelope: SendEnvelope): boolean {
    // ... existing delivery logic

    // Dispatch webhook
    if (this.webhookManager && sent) {
      this.webhookManager.dispatch('message.delivered', {
        id: deliver.id,
        from,
        to,
        preview: envelope.payload.body.substring(0, 100),
        timestamp: new Date(deliver.ts).toISOString(),
      });
    }

    return sent;
  }
}
```

**Server integration** (`daemon/server.ts`):

```typescript
connection.onActive = () => {
  // ... existing registration logic

  // Dispatch webhook
  if (this.webhookManager && connection.agentName) {
    this.webhookManager.dispatch('agent.connected', {
      name: connection.agentName,
      cli: connection.cli,
      sessionId: connection.sessionId,
      timestamp: new Date().toISOString(),
    });
  }
};

connection.onClose = () => {
  // ... existing cleanup logic

  // Dispatch webhook
  if (this.webhookManager && connection.agentName) {
    this.webhookManager.dispatch('agent.disconnected', {
      name: connection.agentName,
      sessionId: connection.sessionId,
      timestamp: new Date().toISOString(),
    });
  }
};
```

#### Dashboard API

```typescript
// dashboard/server.ts

// List webhooks
app.get('/api/webhooks', requirePro, async (req, res) => {
  const webhooks = await storage.all(`
    SELECT id, url, events, description, enabled, failure_count, last_success_at, created_at
    FROM webhooks
    ORDER BY created_at DESC
  `);

  res.json({
    webhooks: webhooks.map(w => ({
      id: w.id,
      url: w.url,
      events: JSON.parse(w.events),
      description: w.description,
      enabled: !!w.enabled,
      failureCount: w.failure_count,
      lastSuccessAt: w.last_success_at ? new Date(w.last_success_at).toISOString() : null,
      createdAt: new Date(w.created_at).toISOString(),
    })),
  });
});

// Create webhook
app.post('/api/webhooks', requirePro, async (req, res) => {
  const { url, events, secret, description } = req.body;

  if (!url || !events?.length) {
    return res.status(400).json({ error: 'URL and events are required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Validate events
  const validEvents = ['message.sent', 'message.delivered', 'agent.connected', 'agent.disconnected'];
  if (!events.every(e => validEvents.includes(e))) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  const id = await webhookManager.register({ url, events, secret, description });

  res.json({ id });
});

// Test webhook
app.post('/api/webhooks/:id/test', requirePro, async (req, res) => {
  const { id } = req.params;

  await webhookManager.dispatch('test', {
    message: 'This is a test webhook from Agent Relay',
    webhookId: id,
  });

  res.json({ success: true, message: 'Test webhook dispatched' });
});

// Delete webhook
app.delete('/api/webhooks/:id', requirePro, async (req, res) => {
  const { id } = req.params;

  await storage.exec(`DELETE FROM webhooks WHERE id = ?`, [id]);

  res.json({ success: true });
});
```

---

## 4. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Licensing system | P0 | 2 days | None |
| Agent limits enforcement | P0 | 1 day | Licensing |
| Feature flag system | P0 | 1 day | Licensing |
| Dashboard license display | P1 | 1 day | Licensing |

**Milestone**: Free tier has enforced limits, upgrade prompts appear.

### Phase 2: Pro Features (Week 3-4)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| API key management | P0 | 3 days | Licensing |
| Connection authentication | P0 | 2 days | API keys |
| Message retention config | P1 | 1 day | Licensing |
| Webhooks | P1 | 3 days | API keys |
| TLS encryption | P2 | 3 days | None |
| Storage encryption | P2 | 2 days | TLS |

**Milestone**: Pro tier fully functional, customers can upgrade.

### Phase 3: Scale & Polish (Week 5-6)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Batched persistence | P1 | 2 days | None |
| Rate limiting | P1 | 1 day | None |
| Dashboard API key UI | P1 | 2 days | API keys |
| Dashboard webhook UI | P1 | 2 days | Webhooks |
| Documentation | P0 | 3 days | All |

**Milestone**: Production-ready Pro tier with full documentation.

### Phase 4: Team Tier (Week 7-10)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| TCP transport | P0 | 5 days | TLS |
| Multi-machine routing | P0 | 5 days | TCP |
| SSO (SAML/OIDC) | P1 | 5 days | Auth |
| Audit logs | P1 | 3 days | Storage |
| Team dashboard | P1 | 5 days | Multi-machine |

**Milestone**: Team tier available for multi-machine deployments.

---

## 5. Pricing Justification

### Cost Analysis

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| License server | $20 | Fly.io, minimal traffic |
| Support (Pro) | $100/customer | ~2 emails/month |
| Support (Team) | $300/customer | ~5 emails/month |
| Development | $10,000/month | 1 FTE amortized |

### Break-even Analysis

| Tier | Price | Customers Needed | Notes |
|------|-------|------------------|-------|
| Pro @ $29/mo | $29 | 350 | Cover dev costs |
| Pro @ $49/mo | $49 | 210 | Cover dev costs |
| Team @ $149/mo | $149 | 70 | Cover dev costs |

### Competitive Pricing

| Competitor | Comparable Tier | Our Price | Delta |
|-----------|-----------------|-----------|-------|
| GitLab Premium | $29/user/mo | $49/machine/mo | -40% |
| Sidekiq Pro | $99/app/mo | $49/machine/mo | -50% |
| Redis Enterprise | $100+/mo | $49/machine/mo | -50% |

**Recommendation**: Start at $49/mo for Pro, $149/mo for Team. Lower than competitors establishes value.

---

## 6. Risks & Mitigations

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SQLCipher compatibility | Medium | High | Test on all supported platforms |
| TLS performance overhead | Low | Medium | Benchmark before release |
| Webhook delivery failures | Medium | Low | Retry queue with exponential backoff |
| License server downtime | Low | High | Offline license for Enterprise |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Open source fork with Pro features | Medium | High | Move fast, focus on support value |
| Pricing too high | Medium | Medium | Start low, increase with value |
| Pricing too low | Low | Low | Easy to increase, hard to decrease |
| Support burden | High | Medium | Good docs, FAQ, community forums |

### Legal Considerations

1. **License clarity**: MIT for core, proprietary for Pro features
2. **Terms of service**: Required for commercial tiers
3. **Privacy policy**: Required if collecting telemetry
4. **GDPR compliance**: If serving EU customers

---

## Appendix A: CLI Commands

```bash
# License management
agent-relay license show
agent-relay license activate <key>
agent-relay license deactivate

# API key management (Pro)
agent-relay keys list
agent-relay keys create --name "CI Pipeline" --scopes send,receive
agent-relay keys revoke <key-id>

# Webhook management (Pro)
agent-relay webhooks list
agent-relay webhooks add --url https://example.com/hook --events message.delivered
agent-relay webhooks test <webhook-id>
agent-relay webhooks delete <webhook-id>

# TLS (Pro)
agent-relay up --tls-cert ./cert.pem --tls-key ./key.pem
agent-relay up --tls-mutual --tls-ca ./ca.pem

# Retention (Pro)
agent-relay up --retention 30d

# Storage encryption (Pro)
agent-relay keygen --output ./db.key
agent-relay up --db-key ./db.key
```

---

## Appendix B: Environment Variables

```bash
# License
AGENT_RELAY_LICENSE_KEY=ar_pro_xxxx

# Authentication
AGENT_RELAY_REQUIRE_AUTH=true
AGENT_RELAY_API_KEY=ar_key_xxxx  # For clients

# TLS
AGENT_RELAY_TLS_CERT=/path/to/cert.pem
AGENT_RELAY_TLS_KEY=/path/to/key.pem
AGENT_RELAY_TLS_CA=/path/to/ca.pem
AGENT_RELAY_TLS_MUTUAL=true

# Storage
AGENT_RELAY_DB_KEY=<encryption-key>
AGENT_RELAY_RETENTION_DAYS=30

# Telemetry (opt-in)
AGENT_RELAY_TELEMETRY=true
```

---

## Appendix C: Dashboard Mockups

### Pro Features Panel

```
┌─────────────────────────────────────────────────────────────┐
│ License: Pro                    Expires: 2026-01-15        │
├─────────────────────────────────────────────────────────────┤
│ Agents: 47/100                  Messages today: 12,847     │
│ Retention: 30 days              Webhooks: 3 active         │
└─────────────────────────────────────────────────────────────┘
```

### API Keys Management

```
┌─────────────────────────────────────────────────────────────┐
│ API Keys                                        [+ Create]  │
├─────────────────────────────────────────────────────────────┤
│ Name           Key                Last Used      Actions    │
│ ─────────────  ─────────────────  ─────────────  ───────── │
│ CI Pipeline    ar_key_a1b2...     2 hours ago    [Revoke]  │
│ Dev Machine    ar_key_x9y8...     5 mins ago     [Revoke]  │
│ Staging        ar_key_m3n4...     Never          [Revoke]  │
└─────────────────────────────────────────────────────────────┘
```

### Webhooks Management

```
┌─────────────────────────────────────────────────────────────┐
│ Webhooks                                        [+ Create]  │
├─────────────────────────────────────────────────────────────┤
│ URL                              Events         Status      │
│ ─────────────────────────────    ─────────────  ───────── │
│ https://api.slack.com/hook       agent.*        ✓ Active   │
│ https://my-app.com/webhook       message.*      ✓ Active   │
│ https://old-service.com/hook     all            ✗ Failing  │
└─────────────────────────────────────────────────────────────┘
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2025-12-26 | Initial draft |

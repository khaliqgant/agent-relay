/**
 * Dead Letter Queue (DLQ) for Agent Relay
 *
 * Captures failed message deliveries for inspection, retry, and debugging.
 * Messages end up in DLQ when:
 * - Delivery exceeds max retry attempts
 * - TTL expires before successful delivery
 * - Target agent disconnects during delivery
 * - Signature verification fails
 *
 * Features:
 * - Persistent storage (SQLite)
 * - Configurable retention period
 * - Manual retry capability
 * - Failure categorization
 * - Metrics and alerting hooks
 */

import type { Database as BetterSqlite3Database } from 'better-sqlite3';

// =============================================================================
// Types
// =============================================================================

export type DLQFailureReason =
  | 'max_retries_exceeded'
  | 'ttl_expired'
  | 'connection_lost'
  | 'target_not_found'
  | 'signature_invalid'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unknown';

export interface DeadLetter {
  /** Unique identifier */
  id: string;
  /** Original message ID */
  messageId: string;
  /** Sender agent/user */
  from: string;
  /** Intended recipient */
  to: string;
  /** Topic (for subscriptions) */
  topic?: string;
  /** Message kind */
  kind: string;
  /** Message body */
  body: string;
  /** Additional data */
  data?: Record<string, unknown>;
  /** Thread ID */
  thread?: string;
  /** Original send timestamp */
  originalTs: number;
  /** DLQ entry timestamp */
  dlqTs: number;
  /** Failure reason */
  reason: DLQFailureReason;
  /** Detailed error message */
  errorMessage?: string;
  /** Number of delivery attempts made */
  attemptCount: number;
  /** Last attempt timestamp */
  lastAttemptTs?: number;
  /** Retry count from DLQ */
  dlqRetryCount: number;
  /** Whether message has been acknowledged/processed */
  acknowledged: boolean;
  /** Acknowledgment timestamp */
  acknowledgedTs?: number;
  /** Who acknowledged (agent name or 'system') */
  acknowledgedBy?: string;
}

export interface DLQConfig {
  /** Enable DLQ (default: true) */
  enabled: boolean;
  /** Maximum retention period in hours (default: 168 = 7 days) */
  retentionHours: number;
  /** Maximum entries to keep (default: 10000) */
  maxEntries: number;
  /** Enable automatic cleanup (default: true) */
  autoCleanup: boolean;
  /** Cleanup interval in minutes (default: 60) */
  cleanupIntervalMinutes: number;
  /** Alert threshold - emit warning when DLQ size exceeds this */
  alertThreshold: number;
}

export interface DLQStats {
  totalEntries: number;
  unacknowledged: number;
  byReason: Record<DLQFailureReason, number>;
  byTarget: Record<string, number>;
  oldestEntryTs: number | null;
  newestEntryTs: number | null;
  avgRetryCount: number;
}

export interface DLQQuery {
  /** Filter by recipient */
  to?: string;
  /** Filter by sender */
  from?: string;
  /** Filter by failure reason */
  reason?: DLQFailureReason;
  /** Filter by acknowledged status */
  acknowledged?: boolean;
  /** Filter entries after this timestamp */
  afterTs?: number;
  /** Filter entries before this timestamp */
  beforeTs?: number;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by (default: dlqTs DESC) */
  orderBy?: 'dlqTs' | 'originalTs' | 'attemptCount';
  /** Order direction */
  orderDir?: 'ASC' | 'DESC';
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_DLQ_CONFIG: DLQConfig = {
  enabled: true,
  retentionHours: 168, // 7 days
  maxEntries: 10000,
  autoCleanup: true,
  cleanupIntervalMinutes: 60,
  alertThreshold: 1000,
};

// =============================================================================
// DLQ Storage Schema
// =============================================================================

const DLQ_SCHEMA = `
CREATE TABLE IF NOT EXISTS dead_letters (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  topic TEXT,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT,
  thread TEXT,
  original_ts INTEGER NOT NULL,
  dlq_ts INTEGER NOT NULL,
  reason TEXT NOT NULL,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_ts INTEGER,
  dlq_retry_count INTEGER NOT NULL DEFAULT 0,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_ts INTEGER,
  acknowledged_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_dlq_to ON dead_letters(to_agent);
CREATE INDEX IF NOT EXISTS idx_dlq_from ON dead_letters(from_agent);
CREATE INDEX IF NOT EXISTS idx_dlq_reason ON dead_letters(reason);
CREATE INDEX IF NOT EXISTS idx_dlq_ts ON dead_letters(dlq_ts);
CREATE INDEX IF NOT EXISTS idx_dlq_acknowledged ON dead_letters(acknowledged);
`;

// =============================================================================
// Dead Letter Queue Implementation
// =============================================================================

export class DeadLetterQueue {
  private config: DLQConfig;
  private db: BetterSqlite3Database;
  private cleanupTimer?: NodeJS.Timeout;
  private alertCallback?: (stats: DLQStats) => void;

  constructor(db: BetterSqlite3Database, config: Partial<DLQConfig> = {}) {
    this.config = { ...DEFAULT_DLQ_CONFIG, ...config };
    this.db = db;

    // Initialize schema
    this.initSchema();

    // Start cleanup timer if enabled
    if (this.config.autoCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Initialize database schema.
   */
  private initSchema(): void {
    this.db.exec(DLQ_SCHEMA);
  }

  /**
   * Start automatic cleanup timer.
   */
  private startCleanupTimer(): void {
    const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);

    // Don't block process exit
    this.cleanupTimer.unref();
  }

  /**
   * Stop cleanup timer.
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Set callback for alert threshold.
   */
  onAlert(callback: (stats: DLQStats) => void): void {
    this.alertCallback = callback;
  }

  /**
   * Add a failed message to DLQ.
   */
  add(
    messageId: string,
    envelope: {
      from: string;
      to: string;
      topic?: string;
      kind: string;
      body: string;
      data?: Record<string, unknown>;
      thread?: string;
      ts: number;
    },
    reason: DLQFailureReason,
    attemptCount: number,
    errorMessage?: string
  ): DeadLetter {
    if (!this.config.enabled) {
      throw new Error('DLQ is disabled');
    }

    const id = `dlq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const deadLetter: DeadLetter = {
      id,
      messageId,
      from: envelope.from,
      to: envelope.to,
      topic: envelope.topic,
      kind: envelope.kind,
      body: envelope.body,
      data: envelope.data,
      thread: envelope.thread,
      originalTs: envelope.ts,
      dlqTs: now,
      reason,
      errorMessage,
      attemptCount,
      lastAttemptTs: now,
      dlqRetryCount: 0,
      acknowledged: false,
    };

    const stmt = this.db.prepare(`
      INSERT INTO dead_letters (
        id, message_id, from_agent, to_agent, topic, kind, body, data, thread,
        original_ts, dlq_ts, reason, error_message, attempt_count, last_attempt_ts,
        dlq_retry_count, acknowledged
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      deadLetter.id,
      deadLetter.messageId,
      deadLetter.from,
      deadLetter.to,
      deadLetter.topic ?? null,
      deadLetter.kind,
      deadLetter.body,
      deadLetter.data ? JSON.stringify(deadLetter.data) : null,
      deadLetter.thread ?? null,
      deadLetter.originalTs,
      deadLetter.dlqTs,
      deadLetter.reason,
      deadLetter.errorMessage ?? null,
      deadLetter.attemptCount,
      deadLetter.lastAttemptTs ?? null,
      deadLetter.dlqRetryCount,
      deadLetter.acknowledged ? 1 : 0
    );

    console.log(`[dlq] Added dead letter ${id} for message ${messageId}: ${reason}`);

    // Check alert threshold
    this.checkAlertThreshold();

    return deadLetter;
  }

  /**
   * Get a dead letter by ID.
   */
  get(id: string): DeadLetter | null {
    const stmt = this.db.prepare('SELECT * FROM dead_letters WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToDeadLetter(row);
  }

  /**
   * Query dead letters.
   */
  query(query: DLQQuery = {}): DeadLetter[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.to) {
      conditions.push('to_agent = ?');
      params.push(query.to);
    }

    if (query.from) {
      conditions.push('from_agent = ?');
      params.push(query.from);
    }

    if (query.reason) {
      conditions.push('reason = ?');
      params.push(query.reason);
    }

    if (query.acknowledged !== undefined) {
      conditions.push('acknowledged = ?');
      params.push(query.acknowledged ? 1 : 0);
    }

    if (query.afterTs) {
      conditions.push('dlq_ts > ?');
      params.push(query.afterTs);
    }

    if (query.beforeTs) {
      conditions.push('dlq_ts < ?');
      params.push(query.beforeTs);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const orderBy = query.orderBy ?? 'dlq_ts';
    const orderDir = query.orderDir ?? 'DESC';
    const orderColumn = orderBy === 'dlqTs' ? 'dlq_ts'
      : orderBy === 'originalTs' ? 'original_ts'
      : 'attempt_count';

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const sql = `
      SELECT * FROM dead_letters
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDir}
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    return rows.map(row => this.rowToDeadLetter(row));
  }

  /**
   * Acknowledge a dead letter (mark as processed).
   */
  acknowledge(id: string, acknowledgedBy: string = 'system'): boolean {
    const stmt = this.db.prepare(`
      UPDATE dead_letters
      SET acknowledged = 1, acknowledged_ts = ?, acknowledged_by = ?
      WHERE id = ? AND acknowledged = 0
    `);

    const result = stmt.run(Date.now(), acknowledgedBy, id);
    return result.changes > 0;
  }

  /**
   * Acknowledge multiple dead letters.
   */
  acknowledgeMany(ids: string[], acknowledgedBy: string = 'system'): number {
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE dead_letters
      SET acknowledged = 1, acknowledged_ts = ?, acknowledged_by = ?
      WHERE id IN (${placeholders}) AND acknowledged = 0
    `);

    const result = stmt.run(Date.now(), acknowledgedBy, ...ids);
    return result.changes;
  }

  /**
   * Increment retry count for a dead letter.
   */
  incrementRetry(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE dead_letters
      SET dlq_retry_count = dlq_retry_count + 1, last_attempt_ts = ?
      WHERE id = ?
    `);

    const result = stmt.run(Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Remove a dead letter.
   */
  remove(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM dead_letters WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get DLQ statistics.
   */
  getStats(): DLQStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM dead_letters');
    const totalRow = totalStmt.get() as { count: number };

    const unackStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM dead_letters WHERE acknowledged = 0'
    );
    const unackRow = unackStmt.get() as { count: number };

    const byReasonStmt = this.db.prepare(`
      SELECT reason, COUNT(*) as count
      FROM dead_letters
      GROUP BY reason
    `);
    const reasonRows = byReasonStmt.all() as Array<{ reason: string; count: number }>;
    const byReason: Record<DLQFailureReason, number> = {
      max_retries_exceeded: 0,
      ttl_expired: 0,
      connection_lost: 0,
      target_not_found: 0,
      signature_invalid: 0,
      payload_too_large: 0,
      rate_limited: 0,
      unknown: 0,
    };
    for (const row of reasonRows) {
      byReason[row.reason as DLQFailureReason] = row.count;
    }

    const byTargetStmt = this.db.prepare(`
      SELECT to_agent, COUNT(*) as count
      FROM dead_letters
      GROUP BY to_agent
      ORDER BY count DESC
      LIMIT 10
    `);
    const targetRows = byTargetStmt.all() as Array<{ to_agent: string; count: number }>;
    const byTarget: Record<string, number> = {};
    for (const row of targetRows) {
      byTarget[row.to_agent] = row.count;
    }

    const oldestStmt = this.db.prepare(
      'SELECT MIN(dlq_ts) as ts FROM dead_letters WHERE acknowledged = 0'
    );
    const oldestRow = oldestStmt.get() as { ts: number | null };

    const newestStmt = this.db.prepare(
      'SELECT MAX(dlq_ts) as ts FROM dead_letters WHERE acknowledged = 0'
    );
    const newestRow = newestStmt.get() as { ts: number | null };

    const avgRetryStmt = this.db.prepare(
      'SELECT AVG(dlq_retry_count) as avg FROM dead_letters'
    );
    const avgRow = avgRetryStmt.get() as { avg: number | null };

    return {
      totalEntries: totalRow.count,
      unacknowledged: unackRow.count,
      byReason,
      byTarget,
      oldestEntryTs: oldestRow.ts,
      newestEntryTs: newestRow.ts,
      avgRetryCount: avgRow.avg ?? 0,
    };
  }

  /**
   * Cleanup old entries.
   */
  cleanup(): { removed: number; reason: string } {
    const now = Date.now();
    const cutoffTs = now - this.config.retentionHours * 3600 * 1000;

    // Remove old acknowledged entries first
    const oldAckStmt = this.db.prepare(`
      DELETE FROM dead_letters
      WHERE acknowledged = 1 AND dlq_ts < ?
    `);
    const oldAckResult = oldAckStmt.run(cutoffTs);

    // Remove entries beyond retention (even if unacknowledged)
    const retentionStmt = this.db.prepare(`
      DELETE FROM dead_letters
      WHERE dlq_ts < ?
    `);
    const retentionResult = retentionStmt.run(cutoffTs);

    // Enforce max entries limit
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM dead_letters');
    const countRow = countStmt.get() as { count: number };

    let maxEntriesRemoved = 0;
    if (countRow.count > this.config.maxEntries) {
      const excess = countRow.count - this.config.maxEntries;
      const trimStmt = this.db.prepare(`
        DELETE FROM dead_letters
        WHERE id IN (
          SELECT id FROM dead_letters
          WHERE acknowledged = 1
          ORDER BY dlq_ts ASC
          LIMIT ?
        )
      `);
      const trimResult = trimStmt.run(excess);
      maxEntriesRemoved = trimResult.changes;
    }

    const totalRemoved = oldAckResult.changes + retentionResult.changes + maxEntriesRemoved;

    if (totalRemoved > 0) {
      console.log(`[dlq] Cleanup removed ${totalRemoved} entries`);
    }

    return {
      removed: totalRemoved,
      reason: `retention=${retentionResult.changes}, maxEntries=${maxEntriesRemoved}`,
    };
  }

  /**
   * Check if we've exceeded alert threshold and call alert callback.
   */
  private checkAlertThreshold(): void {
    if (!this.alertCallback) return;

    const stats = this.getStats();
    if (stats.unacknowledged >= this.config.alertThreshold) {
      this.alertCallback(stats);
    }
  }

  /**
   * Convert database row to DeadLetter object.
   */
  private rowToDeadLetter(row: Record<string, unknown>): DeadLetter {
    return {
      id: row.id as string,
      messageId: row.message_id as string,
      from: row.from_agent as string,
      to: row.to_agent as string,
      topic: row.topic as string | undefined,
      kind: row.kind as string,
      body: row.body as string,
      data: row.data ? JSON.parse(row.data as string) : undefined,
      thread: row.thread as string | undefined,
      originalTs: row.original_ts as number,
      dlqTs: row.dlq_ts as number,
      reason: row.reason as DLQFailureReason,
      errorMessage: row.error_message as string | undefined,
      attemptCount: row.attempt_count as number,
      lastAttemptTs: row.last_attempt_ts as number | undefined,
      dlqRetryCount: row.dlq_retry_count as number,
      acknowledged: (row.acknowledged as number) === 1,
      acknowledgedTs: row.acknowledged_ts as number | undefined,
      acknowledgedBy: row.acknowledged_by as string | undefined,
    };
  }

  /**
   * Export dead letters for external processing.
   */
  export(query: DLQQuery = {}): string {
    const letters = this.query(query);
    return JSON.stringify(letters, null, 2);
  }

  /**
   * Get messages ready for retry (unacknowledged, low retry count).
   */
  getRetryable(maxRetries: number = 3, limit: number = 10): DeadLetter[] {
    const stmt = this.db.prepare(`
      SELECT * FROM dead_letters
      WHERE acknowledged = 0 AND dlq_retry_count < ?
      ORDER BY dlq_ts ASC
      LIMIT ?
    `);

    const rows = stmt.all(maxRetries, limit) as Record<string, unknown>[];
    return rows.map(row => this.rowToDeadLetter(row));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a DLQ instance with the given database.
 */
export function createDeadLetterQueue(
  db: BetterSqlite3Database,
  config?: Partial<DLQConfig>
): DeadLetterQueue {
  return new DeadLetterQueue(db, config);
}

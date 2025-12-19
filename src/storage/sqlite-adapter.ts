import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { type MessageQuery, type StorageAdapter, type StoredMessage } from './adapter.js';

export interface SqliteAdapterOptions {
  dbPath: string;
}

export class SqliteStorageAdapter implements StorageAdapter {
  private dbPath: string;
  private db?: Database.Database;
  private insertStmt?: Database.Statement;

  constructor(options: SqliteAdapterOptions) {
    this.dbPath = options.dbPath;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        topic TEXT,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        data TEXT,
        delivery_seq INTEGER,
        delivery_session_id TEXT,
        session_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages (ts);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender);
      CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages (recipient);
      CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages (topic);
    `);

    this.insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages
      (id, ts, sender, recipient, topic, kind, body, data, delivery_seq, delivery_session_id, session_id)
      VALUES (@id, @ts, @sender, @recipient, @topic, @kind, @body, @data, @delivery_seq, @delivery_session_id, @session_id)
    `);
  }

  async saveMessage(message: StoredMessage): Promise<void> {
    if (!this.db || !this.insertStmt) {
      throw new Error('SqliteStorageAdapter not initialized');
    }

    const payload = {
      id: message.id,
      ts: message.ts,
      sender: message.from,
      recipient: message.to,
      topic: message.topic ?? null,
      kind: message.kind,
      body: message.body,
      data: message.data ? JSON.stringify(message.data) : null,
      delivery_seq: message.deliverySeq ?? null,
      delivery_session_id: message.deliverySessionId ?? null,
      session_id: message.sessionId ?? null,
    };

    this.insertStmt.run(payload);
  }

  async getMessages(query: MessageQuery = {}): Promise<StoredMessage[]> {
    if (!this.db) {
      throw new Error('SqliteStorageAdapter not initialized');
    }

    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (query.sinceTs) {
      clauses.push('ts >= @sinceTs');
      params.sinceTs = query.sinceTs;
    }
    if (query.from) {
      clauses.push('sender = @from');
      params.from = query.from;
    }
    if (query.to) {
      clauses.push('recipient = @to');
      params.to = query.to;
    }
    if (query.topic) {
      clauses.push('topic = @topic');
      params.topic = query.topic;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const limit = query.limit ?? 200;

    const stmt = this.db.prepare(`
      SELECT id, ts, sender, recipient, topic, kind, body, data, delivery_seq, delivery_session_id, session_id
      FROM messages
      ${where}
      ORDER BY ts ${order}
      LIMIT @limit
    `);

    const rows = stmt.all({ ...params, limit });
    return rows.map((row: any) => ({
      id: row.id,
      ts: row.ts,
      from: row.sender,
      to: row.recipient,
      topic: row.topic ?? undefined,
      kind: row.kind,
      body: row.body,
      data: row.data ? JSON.parse(row.data) : undefined,
      deliverySeq: row.delivery_seq ?? undefined,
      deliverySessionId: row.delivery_session_id ?? undefined,
      sessionId: row.session_id ?? undefined,
    }));
  }

  async getMessageById(id: string): Promise<StoredMessage | null> {
    if (!this.db) {
      throw new Error('SqliteStorageAdapter not initialized');
    }

    // Support both exact match and prefix match (for short IDs like "06eb33da")
    const stmt = this.db.prepare(`
      SELECT id, ts, sender, recipient, topic, kind, body, data, delivery_seq, delivery_session_id, session_id
      FROM messages
      WHERE id = ? OR id LIKE ?
      ORDER BY ts DESC
      LIMIT 1
    `);

    const row: any = stmt.get(id, `${id}%`);
    if (!row) return null;

    return {
      id: row.id,
      ts: row.ts,
      from: row.sender,
      to: row.recipient,
      topic: row.topic ?? undefined,
      kind: row.kind,
      body: row.body,
      data: row.data ? JSON.parse(row.data) : undefined,
      deliverySeq: row.delivery_seq ?? undefined,
      deliverySessionId: row.delivery_session_id ?? undefined,
      sessionId: row.session_id ?? undefined,
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}

/**
 * Message router for the agent relay daemon.
 * Handles routing messages between agents, topic subscriptions, and broadcast.
 */

import { v4 as uuid } from 'uuid';
import {
  type Envelope,
  type SendPayload,
  type DeliverEnvelope,
  PROTOCOL_VERSION,
} from '../protocol/types.js';
import type { StorageAdapter } from '../storage/adapter.js';

export interface RoutableConnection {
  id: string;
  agentName?: string;
  cli?: string;
  sessionId: string;
  close(): void;
  send(envelope: Envelope): boolean;
  getNextSeq(topic: string, peer: string): number;
}

export class Router {
  private storage?: StorageAdapter;
  private connections: Map<string, RoutableConnection> = new Map(); // connectionId -> Connection
  private agents: Map<string, RoutableConnection> = new Map(); // agentName -> Connection
  private subscriptions: Map<string, Set<string>> = new Map(); // topic -> Set<agentName>

  constructor(options: { storage?: StorageAdapter } = {}) {
    this.storage = options.storage;
  }

  /**
   * Register a connection after successful handshake.
   */
  register(connection: RoutableConnection): void {
    this.connections.set(connection.id, connection);

    if (connection.agentName) {
      // Handle existing connection with same name (disconnect old)
      const existing = this.agents.get(connection.agentName);
      if (existing && existing.id !== connection.id) {
        existing.close();
        this.connections.delete(existing.id);
      }
      this.agents.set(connection.agentName, connection);
    }
  }

  /**
   * Unregister a connection.
   */
  unregister(connection: RoutableConnection): void {
    this.connections.delete(connection.id);
    if (connection.agentName) {
      const current = this.agents.get(connection.agentName);
      if (current?.id === connection.id) {
        this.agents.delete(connection.agentName);
      }

      // Remove from all subscriptions
      for (const subscribers of this.subscriptions.values()) {
        subscribers.delete(connection.agentName);
      }
    }
  }

  /**
   * Subscribe an agent to a topic.
   */
  subscribe(agentName: string, topic: string): void {
    let subscribers = this.subscriptions.get(topic);
    if (!subscribers) {
      subscribers = new Set();
      this.subscriptions.set(topic, subscribers);
    }
    subscribers.add(agentName);
  }

  /**
   * Unsubscribe an agent from a topic.
   */
  unsubscribe(agentName: string, topic: string): void {
    const subscribers = this.subscriptions.get(topic);
    if (subscribers) {
      subscribers.delete(agentName);
      if (subscribers.size === 0) {
        this.subscriptions.delete(topic);
      }
    }
  }

  /**
   * Route a SEND message to its destination(s).
   */
  route(from: RoutableConnection, envelope: Envelope<SendPayload>): void {
    const senderName = from.agentName;
    if (!senderName) {
      console.log(`[router] Dropping message - sender has no name`);
      return;
    }

    const to = envelope.to;
    const topic = envelope.topic;

    console.log(`[router] ${senderName} -> ${to}: ${envelope.payload.body?.substring(0, 50)}...`);

    if (to === '*') {
      // Broadcast to all (except sender)
      this.broadcast(senderName, envelope, topic);
    } else if (to) {
      // Direct message
      this.sendDirect(senderName, to, envelope);
    }
  }

  /**
   * Send a direct message to a specific agent.
   */
  private sendDirect(
    from: string,
    to: string,
    envelope: Envelope<SendPayload>
  ): boolean {
    const target = this.agents.get(to);
    if (!target) {
      console.log(`[router] Target "${to}" not found. Available agents: ${Array.from(this.agents.keys()).join(', ')}`);
      return false;
    }

    const deliver = this.createDeliverEnvelope(from, to, envelope, target);
    const sent = target.send(deliver);
    console.log(`[router] Delivered to ${to}: ${sent ? 'success' : 'failed'}`);
    this.persistDeliverEnvelope(deliver);
    return sent;
  }

  /**
   * Broadcast to all agents (optionally filtered by topic subscription).
   */
  private broadcast(
    from: string,
    envelope: Envelope<SendPayload>,
    topic?: string
  ): void {
    const recipients = topic
      ? this.subscriptions.get(topic) ?? new Set()
      : new Set(this.agents.keys());

    for (const agentName of recipients) {
      if (agentName === from) continue; // Don't send to self

      const target = this.agents.get(agentName);
      if (target) {
        const deliver = this.createDeliverEnvelope(from, agentName, envelope, target);
        target.send(deliver);
        this.persistDeliverEnvelope(deliver);
      }
    }
  }

  /**
   * Create a DELIVER envelope from a SEND.
   */
  private createDeliverEnvelope(
    from: string,
    to: string,
    original: Envelope<SendPayload>,
    target: RoutableConnection
  ): DeliverEnvelope {
    return {
      v: PROTOCOL_VERSION,
      type: 'DELIVER',
      id: uuid(),
      ts: Date.now(),
      from,
      to,
      topic: original.topic,
      payload: original.payload,
      delivery: {
        seq: target.getNextSeq(original.topic ?? 'default', from),
        session_id: target.sessionId,
      },
    };
  }

  /**
   * Persist a delivered message if storage is configured.
   */
  private persistDeliverEnvelope(envelope: DeliverEnvelope): void {
    if (!this.storage) return;

    this.storage.saveMessage({
      id: envelope.id,
      ts: envelope.ts,
      from: envelope.from ?? 'unknown',
      to: envelope.to ?? 'unknown',
      topic: envelope.topic,
      kind: envelope.payload.kind,
      body: envelope.payload.body,
      data: envelope.payload.data,
      deliverySeq: envelope.delivery.seq,
      deliverySessionId: envelope.delivery.session_id,
      sessionId: envelope.delivery.session_id,
    }).catch((err) => {
      console.error('[router] Failed to persist message', err);
    });
  }

  /**
   * Get list of connected agent names.
   */
  getAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get connection by agent name.
   */
  getConnection(agentName: string): RoutableConnection | undefined {
    return this.agents.get(agentName);
  }

  /**
   * Get number of active connections.
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}

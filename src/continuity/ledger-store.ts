/**
 * Ledger Store
 *
 * Persists within-session state as JSON files.
 * One ledger per agent, overwritten each session.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Ledger } from './types.js';

export class LedgerStore {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Ensure the ledgers directory exists
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  /**
   * Get the file path for an agent's ledger
   */
  private getLedgerPath(agentName: string): string {
    // Sanitize agent name for filesystem
    const safeName = agentName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.basePath, `${safeName}.json`);
  }

  /**
   * Save a ledger for an agent
   */
  async save(agentName: string, ledger: Ledger): Promise<void> {
    await this.initialize();
    const filePath = this.getLedgerPath(agentName);

    // Ensure updatedAt is set
    const ledgerToSave: Ledger = {
      ...ledger,
      agentName,
      updatedAt: new Date(),
    };

    await fs.writeFile(filePath, JSON.stringify(ledgerToSave, null, 2), 'utf-8');
  }

  /**
   * Load a ledger for an agent
   */
  async load(agentName: string): Promise<Ledger | null> {
    const filePath = this.getLedgerPath(agentName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ledger = JSON.parse(content) as Ledger;

      // Parse date strings back to Date objects
      ledger.updatedAt = new Date(ledger.updatedAt);
      if (ledger.keyDecisions) {
        ledger.keyDecisions = ledger.keyDecisions.map((d) => ({
          ...d,
          timestamp: new Date(d.timestamp),
        }));
      }

      return ledger;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a ledger for an agent
   */
  async delete(agentName: string): Promise<boolean> {
    const filePath = this.getLedgerPath(agentName);

    try {
      await fs.unlink(filePath);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a ledger exists for an agent
   */
  async exists(agentName: string): Promise<boolean> {
    const filePath = this.getLedgerPath(agentName);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all agents with ledgers
   */
  async listAgents(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => f.replace('.json', ''));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Update specific fields in a ledger (merge)
   */
  async update(
    agentName: string,
    updates: Partial<Omit<Ledger, 'agentName' | 'updatedAt'>>
  ): Promise<Ledger | null> {
    const existing = await this.load(agentName);
    if (!existing) {
      return null;
    }

    const updated: Ledger = {
      ...existing,
      ...updates,
      agentName,
      updatedAt: new Date(),
    };

    await this.save(agentName, updated);
    return updated;
  }

  /**
   * Add an item to a list field (completed, inProgress, etc.)
   */
  async addToList(
    agentName: string,
    field: 'completed' | 'inProgress' | 'blocked' | 'uncertainItems',
    item: string
  ): Promise<boolean> {
    const ledger = await this.load(agentName);
    if (!ledger) {
      return false;
    }

    if (!ledger[field].includes(item)) {
      ledger[field].push(item);
      await this.save(agentName, ledger);
    }
    return true;
  }

  /**
   * Add a decision to the ledger
   */
  async addDecision(
    agentName: string,
    decision: Omit<Ledger['keyDecisions'][0], 'timestamp'>
  ): Promise<boolean> {
    const ledger = await this.load(agentName);
    if (!ledger) {
      return false;
    }

    ledger.keyDecisions.push({
      ...decision,
      timestamp: new Date(),
    });
    await this.save(agentName, ledger);
    return true;
  }

  /**
   * Create an empty ledger for an agent
   */
  async create(
    agentName: string,
    cli: string,
    sessionId: string
  ): Promise<Ledger> {
    const ledger: Ledger = {
      agentName,
      sessionId,
      cli,
      currentTask: '',
      completed: [],
      inProgress: [],
      blocked: [],
      keyDecisions: [],
      uncertainItems: [],
      fileContext: [],
      updatedAt: new Date(),
    };

    await this.save(agentName, ledger);
    return ledger;
  }
}

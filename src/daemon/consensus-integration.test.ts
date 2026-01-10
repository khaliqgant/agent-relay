/**
 * Tests for Consensus Integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsensusIntegration,
  createConsensusIntegration,
} from './consensus-integration.js';
import type { Router, RoutableConnection } from './router.js';

// =============================================================================
// Mock Router
// =============================================================================

function createMockRouter(): Router {
  const connections = new Map<string, RoutableConnection>();

  return {
    getConnection: vi.fn((name: string) => connections.get(name)),
    route: vi.fn(),
    register: vi.fn((conn: RoutableConnection) => {
      if (conn.agentName) {
        connections.set(conn.agentName, conn);
      }
    }),
    unregister: vi.fn(),
    getAgents: vi.fn(() => Array.from(connections.keys())),
  } as unknown as Router;
}

function createMockConnection(name: string): RoutableConnection {
  return {
    id: `conn-${name}`,
    agentName: name,
    sessionId: `session-${name}`,
    close: vi.fn(),
    send: vi.fn(() => true),
    getNextSeq: vi.fn(() => 1),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ConsensusIntegration', () => {
  let router: Router;
  let consensus: ConsensusIntegration;

  beforeEach(() => {
    router = createMockRouter();
    consensus = createConsensusIntegration(router, {
      enabled: true,
      logEvents: false, // Silence logs in tests
    });

    // Register some mock agents
    const lead = createMockConnection('Lead');
    const dev = createMockConnection('Developer');
    const reviewer = createMockConnection('Reviewer');

    router.register(lead);
    router.register(dev);
    router.register(reviewer);
  });

  describe('enabled state', () => {
    it('reports enabled state correctly', () => {
      expect(consensus.enabled).toBe(true);

      const disabled = createConsensusIntegration(router, { enabled: false });
      expect(disabled.enabled).toBe(false);
    });

    it('throws when creating proposal while disabled', () => {
      const disabled = createConsensusIntegration(router, { enabled: false });

      expect(() => disabled.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposer: 'Lead',
        participants: ['Developer'],
      })).toThrow('Consensus is not enabled');
    });
  });

  describe('createProposal', () => {
    it('creates a proposal', () => {
      const proposal = consensus.createProposal({
        title: 'API Design Review',
        description: 'Should we proceed with REST?',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
        consensusType: 'majority',
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.title).toBe('API Design Review');
      expect(proposal.proposer).toBe('Lead');
      expect(proposal.participants).toEqual(['Developer', 'Reviewer']);
      expect(proposal.status).toBe('pending');
    });

    it('broadcasts proposal to participants', () => {
      consensus.createProposal({
        title: 'Test Proposal',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
      });

      // Should have called route for each participant
      expect(router.route).toHaveBeenCalled();
    });

    it('includes thread in proposal', () => {
      const proposal = consensus.createProposal({
        title: 'My Feature',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'],
      });

      expect(proposal.thread).toContain('consensus-');
    });
  });

  describe('processIncomingMessage', () => {
    it('returns isConsensusCommand=false for non-consensus messages', () => {
      const result = consensus.processIncomingMessage('Developer', 'Hello team!');
      expect(result.isConsensusCommand).toBe(false);
    });

    it('processes vote commands', () => {
      // Create a proposal first
      const proposal = consensus.createProposal({
        title: 'Test Vote',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
      });

      // Process a vote
      const result = consensus.processIncomingMessage(
        'Developer',
        `VOTE ${proposal.id} approve Looks good!`
      );

      expect(result.isConsensusCommand).toBe(true);
      expect(result.type).toBe('vote');
      expect(result.result?.success).toBe(true);
    });

    it('handles vote for non-existent proposal', () => {
      const result = consensus.processIncomingMessage(
        'Developer',
        'VOTE nonexistent-id approve'
      );

      expect(result.isConsensusCommand).toBe(true);
      expect(result.type).toBe('vote');
      expect(result.result?.success).toBe(false);
      expect(result.result?.error).toContain('not found');
    });

    it('handles vote from non-participant', () => {
      const proposal = consensus.createProposal({
        title: 'Test',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'], // Reviewer not included
      });

      const result = consensus.processIncomingMessage(
        'Reviewer',
        `VOTE ${proposal.id} approve`
      );

      expect(result.isConsensusCommand).toBe(true);
      expect(result.type).toBe('vote');
      expect(result.result?.success).toBe(false);
      expect(result.result?.error).toContain('not a participant');
    });

    it('returns isConsensusCommand=false when disabled', () => {
      const disabled = createConsensusIntegration(router, { enabled: false });

      const result = disabled.processIncomingMessage('Developer', 'VOTE x approve');
      expect(result.isConsensusCommand).toBe(false);
    });

    it('processes PROPOSE commands', () => {
      const result = consensus.processIncomingMessage(
        'Lead',
        `PROPOSE: API Design Review
TYPE: majority
PARTICIPANTS: Developer, Reviewer
DESCRIPTION: Should we use REST or GraphQL?`
      );

      expect(result.isConsensusCommand).toBe(true);
      expect(result.type).toBe('propose');
      expect(result.result?.success).toBe(true);
      expect(result.result?.proposal).toBeDefined();
      expect(result.result?.proposal?.title).toBe('API Design Review');
      expect(result.result?.proposal?.participants).toContain('Developer');
    });
  });

  describe('getPendingVotes', () => {
    it('returns proposals awaiting vote from agent', () => {
      consensus.createProposal({
        title: 'Proposal 1',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
      });

      const pending = consensus.getPendingVotes('Developer');
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('Proposal 1');
    });

    it('excludes proposals already voted on', () => {
      const proposal = consensus.createProposal({
        title: 'Proposal 1',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
      });

      // Developer votes
      consensus.processIncomingMessage('Developer', `VOTE ${proposal.id} approve`);

      const devPending = consensus.getPendingVotes('Developer');
      const reviewerPending = consensus.getPendingVotes('Reviewer');

      expect(devPending).toHaveLength(0);
      expect(reviewerPending).toHaveLength(1);
    });
  });

  describe('getProposals', () => {
    it('returns all proposals for an agent', () => {
      consensus.createProposal({
        title: 'Proposal 1',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'],
      });

      consensus.createProposal({
        title: 'Proposal 2',
        description: 'Test',
        proposer: 'Developer',
        participants: ['Lead'],
      });

      const leadProposals = consensus.getProposals('Lead');
      const devProposals = consensus.getProposals('Developer');

      // Lead is proposer of 1, participant of 2
      expect(leadProposals).toHaveLength(2);
      // Developer is participant of 1, proposer of 2
      expect(devProposals).toHaveLength(2);
    });
  });

  describe('cancelProposal', () => {
    it('allows proposer to cancel', () => {
      const proposal = consensus.createProposal({
        title: 'Test',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'],
      });

      const result = consensus.cancelProposal(proposal.id, 'Lead');
      expect(result.success).toBe(true);

      const updated = consensus.getProposal(proposal.id);
      expect(updated?.status).toBe('cancelled');
    });

    it('prevents non-proposer from canceling', () => {
      const proposal = consensus.createProposal({
        title: 'Test',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'],
      });

      const result = consensus.cancelProposal(proposal.id, 'Developer');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Only proposer');
    });
  });

  describe('getStats', () => {
    it('returns consensus statistics', () => {
      consensus.createProposal({
        title: 'Test',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'],
      });

      const stats = consensus.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  describe('consensus resolution', () => {
    it('resolves proposal when majority reached', () => {
      const proposal = consensus.createProposal({
        title: 'Majority Vote',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
        consensusType: 'majority',
      });

      // Both approve
      consensus.processIncomingMessage('Developer', `VOTE ${proposal.id} approve`);
      consensus.processIncomingMessage('Reviewer', `VOTE ${proposal.id} approve`);

      const updated = consensus.getProposal(proposal.id);
      expect(updated?.status).toBe('approved');
      expect(updated?.result?.decision).toBe('approved');
    });

    it('resolves proposal when unanimous required but rejected', () => {
      const proposal = consensus.createProposal({
        title: 'Unanimous Vote',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer', 'Reviewer'],
        consensusType: 'unanimous',
      });

      // One rejects
      consensus.processIncomingMessage('Developer', `VOTE ${proposal.id} reject`);

      const updated = consensus.getProposal(proposal.id);
      expect(updated?.status).toBe('rejected');
    });
  });

  describe('cleanup', () => {
    it('cleans up engine resources', () => {
      consensus.createProposal({
        title: 'Test',
        description: 'Test',
        proposer: 'Lead',
        participants: ['Developer'],
        timeoutMs: 60000,
      });

      // Should not throw
      consensus.cleanup();
    });
  });
});

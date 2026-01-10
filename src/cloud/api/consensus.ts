/**
 * Consensus API Routes (Read-Only)
 *
 * Provides API endpoints for observing multi-agent consensus decisions.
 * The dashboard is read-only - agents handle all consensus activity via relay messages.
 *
 * Architecture:
 * - Agents create proposals and vote via ->relay:_consensus messages
 * - The daemon processes these and syncs state to cloud via /sync endpoint
 * - Dashboard reads consensus state for display only
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from './auth.js';
import type { Proposal } from '../../daemon/consensus.js';

export const consensusRouter = Router();

// ============================================================================
// In-Memory Consensus State (synced from daemon)
// ============================================================================

// Stores proposals synced from the daemon
// In production, this would be backed by a database
const workspaceProposals = new Map<string, Map<string, Proposal>>();

function getProposalsForWorkspace(workspaceId: string): Map<string, Proposal> {
  let proposals = workspaceProposals.get(workspaceId);
  if (!proposals) {
    proposals = new Map();
    workspaceProposals.set(workspaceId, proposals);
  }
  return proposals;
}

function computeStats(proposals: Map<string, Proposal>) {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let expired = 0;
  let cancelled = 0;

  for (const proposal of proposals.values()) {
    switch (proposal.status) {
      case 'pending':
        pending++;
        break;
      case 'approved':
        approved++;
        break;
      case 'rejected':
        rejected++;
        break;
      case 'expired':
        expired++;
        break;
      case 'cancelled':
        cancelled++;
        break;
    }
  }

  return {
    total: proposals.size,
    pending,
    approved,
    rejected,
    expired,
    cancelled,
  };
}

// ============================================================================
// Read-Only Routes (require user authentication)
// ============================================================================

/**
 * GET /api/workspaces/:workspaceId/consensus/proposals
 * List all proposals for a workspace (read-only)
 */
consensusRouter.get(
  '/workspaces/:workspaceId/consensus/proposals',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.params;
      const { status, agent } = req.query;

      const proposalsMap = getProposalsForWorkspace(workspaceId);
      let proposals = Array.from(proposalsMap.values());

      // Filter by agent if provided
      if (agent && typeof agent === 'string') {
        proposals = proposals.filter(
          p => p.proposer === agent || p.participants.includes(agent)
        );
      }

      // Filter by status if provided
      if (status && typeof status === 'string') {
        proposals = proposals.filter(p => p.status === status);
      }

      // Sort by creation time (most recent first)
      proposals.sort((a, b) => b.createdAt - a.createdAt);

      const stats = computeStats(proposalsMap);

      res.json({
        proposals,
        stats,
      });
    } catch (error) {
      console.error('Error listing proposals:', error);
      res.status(500).json({ error: 'Failed to list proposals' });
    }
  }
);

/**
 * GET /api/workspaces/:workspaceId/consensus/proposals/:proposalId
 * Get a specific proposal (read-only)
 */
consensusRouter.get(
  '/workspaces/:workspaceId/consensus/proposals/:proposalId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { workspaceId, proposalId } = req.params;

      const proposalsMap = getProposalsForWorkspace(workspaceId);
      const proposal = proposalsMap.get(proposalId);

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      res.json({ proposal });
    } catch (error) {
      console.error('Error getting proposal:', error);
      res.status(500).json({ error: 'Failed to get proposal' });
    }
  }
);

/**
 * GET /api/workspaces/:workspaceId/consensus/agents/:agentName/pending
 * Get pending votes for an agent (read-only)
 */
consensusRouter.get(
  '/workspaces/:workspaceId/consensus/agents/:agentName/pending',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { workspaceId, agentName } = req.params;

      const proposalsMap = getProposalsForWorkspace(workspaceId);
      const proposals = Array.from(proposalsMap.values()).filter(p => {
        if (p.status !== 'pending') return false;
        if (!p.participants.includes(agentName)) return false;
        // Check if agent hasn't voted yet
        return !p.votes.some(v => v.agent === agentName);
      });

      res.json({ proposals });
    } catch (error) {
      console.error('Error getting pending votes:', error);
      res.status(500).json({ error: 'Failed to get pending votes' });
    }
  }
);

/**
 * GET /api/workspaces/:workspaceId/consensus/stats
 * Get consensus statistics for a workspace (read-only)
 */
consensusRouter.get(
  '/workspaces/:workspaceId/consensus/stats',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.params;

      const proposalsMap = getProposalsForWorkspace(workspaceId);
      const stats = computeStats(proposalsMap);

      res.json({ stats });
    } catch (error) {
      console.error('Error getting consensus stats:', error);
      res.status(500).json({ error: 'Failed to get consensus stats' });
    }
  }
);

// ============================================================================
// Sync Endpoint (daemon -> cloud, uses daemon API key auth)
// ============================================================================

/**
 * POST /api/workspaces/:workspaceId/consensus/sync
 * Sync consensus state from daemon (called by daemon on proposal events)
 *
 * This endpoint receives state updates from the daemon and stores them
 * so the dashboard can display agent consensus activity.
 *
 * Authentication: Uses daemon API key (X-Daemon-Key header) or session auth
 */
consensusRouter.post(
  '/workspaces/:workspaceId/consensus/sync',
  async (req: Request, res: Response) => {
    try {
      // Check for daemon API key or session auth
      const daemonKey = req.headers['x-daemon-key'];
      const expectedKey = process.env.DAEMON_API_KEY;

      // Allow either daemon key auth OR session auth (for testing)
      const hasDaemonAuth = expectedKey && daemonKey === expectedKey;
      const hasSessionAuth = req.session?.userId;

      if (!hasDaemonAuth && !hasSessionAuth) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { workspaceId } = req.params;
      const { proposal, event } = req.body as {
        proposal: Proposal;
        event: 'created' | 'voted' | 'resolved' | 'expired' | 'cancelled';
      };

      if (!proposal || !event) {
        return res.status(400).json({ error: 'Missing proposal or event' });
      }

      // Store/update the proposal
      const proposalsMap = getProposalsForWorkspace(workspaceId);
      proposalsMap.set(proposal.id, proposal);

      console.log(
        `[consensus] Synced ${event} for proposal "${proposal.title}" (${proposal.id}) in workspace ${workspaceId}`
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error syncing consensus:', error);
      res.status(500).json({ error: 'Failed to sync consensus' });
    }
  }
);

/**
 * DELETE /api/workspaces/:workspaceId/consensus/proposals/:proposalId
 * Remove a proposal from the sync cache (daemon cleanup)
 *
 * Authentication: Uses daemon API key (X-Daemon-Key header)
 */
consensusRouter.delete(
  '/workspaces/:workspaceId/consensus/proposals/:proposalId',
  async (req: Request, res: Response) => {
    try {
      // Check for daemon API key
      const daemonKey = req.headers['x-daemon-key'];
      const expectedKey = process.env.DAEMON_API_KEY;

      if (!expectedKey || daemonKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized - daemon key required' });
      }

      const { workspaceId, proposalId } = req.params;

      const proposalsMap = getProposalsForWorkspace(workspaceId);
      const deleted = proposalsMap.delete(proposalId);

      if (!deleted) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      console.log(`[consensus] Removed proposal ${proposalId} from workspace ${workspaceId}`);

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing proposal:', error);
      res.status(500).json({ error: 'Failed to remove proposal' });
    }
  }
);

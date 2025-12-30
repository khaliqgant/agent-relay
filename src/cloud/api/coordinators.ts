/**
 * Coordinator Agent API Routes
 *
 * Manage coordinator agents for project groups.
 * Coordinators oversee and orchestrate work across repositories in a group.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from './auth.js';
import { checkCoordinatorAccess } from './middleware/planLimits.js';
import { db, CoordinatorAgentConfig } from '../db/index.js';
import { getCoordinatorService } from '../services/coordinator.js';

export const coordinatorsRouter = Router();

// All routes require authentication
coordinatorsRouter.use(requireAuth);

// Coordinator modification routes require Pro plan or higher
const coordinatorWriteRoutes = [
  '/:groupId/coordinator/enable',
  '/:groupId/coordinator/disable',
];
coordinatorWriteRoutes.forEach(route => {
  coordinatorsRouter.use(route, checkCoordinatorAccess);
});

/**
 * GET /api/project-groups/:groupId/coordinator
 * Get coordinator agent configuration
 */
coordinatorsRouter.get('/:groupId/coordinator', async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { groupId } = req.params;

  try {
    const group = await db.projectGroups.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Project group not found' });
    }

    if (group.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      groupId: group.id,
      groupName: group.name,
      coordinator: group.coordinatorAgent || { enabled: false },
    });
  } catch (error) {
    console.error('Error getting coordinator config:', error);
    res.status(500).json({ error: 'Failed to get coordinator configuration' });
  }
});

/**
 * PUT /api/project-groups/:groupId/coordinator
 * Update coordinator agent configuration
 */
coordinatorsRouter.put('/:groupId/coordinator', async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { groupId } = req.params;
  const { name, model, systemPrompt, capabilities } = req.body;

  try {
    const group = await db.projectGroups.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Project group not found' });
    }

    if (group.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Build updated config, preserving enabled state
    const currentConfig = group.coordinatorAgent || { enabled: false };
    const updatedConfig: CoordinatorAgentConfig = {
      enabled: currentConfig.enabled,
      name: name !== undefined ? name : currentConfig.name,
      model: model !== undefined ? model : currentConfig.model,
      systemPrompt: systemPrompt !== undefined ? systemPrompt : currentConfig.systemPrompt,
      capabilities: capabilities !== undefined ? capabilities : currentConfig.capabilities,
    };

    await db.projectGroups.updateCoordinatorAgent(groupId, updatedConfig);

    // If coordinator is currently enabled, restart it with new config
    if (updatedConfig.enabled) {
      const coordinatorService = getCoordinatorService();
      await coordinatorService.restart(groupId);
    }

    res.json({
      success: true,
      coordinator: updatedConfig,
    });
  } catch (error) {
    console.error('Error updating coordinator config:', error);
    res.status(500).json({ error: 'Failed to update coordinator configuration' });
  }
});

/**
 * POST /api/project-groups/:groupId/coordinator/enable
 * Enable coordinator agent for a project group
 */
coordinatorsRouter.post('/:groupId/coordinator/enable', async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { groupId } = req.params;

  try {
    const group = await db.projectGroups.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Project group not found' });
    }

    if (group.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Plan check is handled by checkCoordinatorAccess middleware

    // Get repositories in the group
    const repositories = await db.repositories.findByProjectGroupId(groupId);

    if (repositories.length === 0) {
      return res.status(400).json({
        error: 'Cannot enable coordinator for empty group',
        message: 'Add at least one repository to this group first',
      });
    }

    // Enable coordinator
    const currentConfig = group.coordinatorAgent || { enabled: false };
    const updatedConfig: CoordinatorAgentConfig = {
      ...currentConfig,
      enabled: true,
      name: currentConfig.name || `${group.name} Coordinator`,
    };

    await db.projectGroups.updateCoordinatorAgent(groupId, updatedConfig);

    // Start the coordinator agent
    const coordinatorService = getCoordinatorService();
    await coordinatorService.start(groupId);

    res.json({
      success: true,
      message: 'Coordinator agent enabled',
      coordinator: updatedConfig,
    });
  } catch (error) {
    console.error('Error enabling coordinator:', error);
    res.status(500).json({ error: 'Failed to enable coordinator agent' });
  }
});

/**
 * POST /api/project-groups/:groupId/coordinator/disable
 * Disable coordinator agent for a project group
 */
coordinatorsRouter.post('/:groupId/coordinator/disable', async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { groupId } = req.params;

  try {
    const group = await db.projectGroups.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Project group not found' });
    }

    if (group.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Disable coordinator
    const currentConfig = group.coordinatorAgent || { enabled: false };
    const updatedConfig: CoordinatorAgentConfig = {
      ...currentConfig,
      enabled: false,
    };

    await db.projectGroups.updateCoordinatorAgent(groupId, updatedConfig);

    // Stop the coordinator agent
    const coordinatorService = getCoordinatorService();
    await coordinatorService.stop(groupId);

    res.json({
      success: true,
      message: 'Coordinator agent disabled',
      coordinator: updatedConfig,
    });
  } catch (error) {
    console.error('Error disabling coordinator:', error);
    res.status(500).json({ error: 'Failed to disable coordinator agent' });
  }
});

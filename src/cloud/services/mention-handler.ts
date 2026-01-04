/**
 * Mention Handler Service
 *
 * Handles @mentions of agents in GitHub issues and PR comments.
 * Routes mentions to appropriate agents for response.
 */

import { db, CommentMention, IssueAssignment } from '../db/index.js';

/**
 * Known agent types that can be mentioned
 */
export const KNOWN_AGENTS = {
  // Generic agents
  'agent-relay': 'General purpose agent for any task',
  'lead': 'Lead agent for coordination and delegation',
  'developer': 'Developer agent for coding tasks',
  'reviewer': 'Code review agent',

  // Specialized agents
  'ci-fix': 'CI failure fixing agent',
  'debugger': 'Bug investigation and fixing agent',
  'docs': 'Documentation agent',
  'test': 'Test writing agent',
  'refactor': 'Code refactoring agent',
} as const;

export type KnownAgentType = keyof typeof KNOWN_AGENTS;

/**
 * Check if a mention is for a known agent type
 */
export function isKnownAgent(mention: string): mention is KnownAgentType {
  return mention in KNOWN_AGENTS;
}

/**
 * Handle a mention record
 *
 * This function:
 * 1. Validates the mention is for a known agent
 * 2. Routes to the appropriate agent handler
 * 3. Spawns or messages the agent
 */
export async function handleMention(mention: CommentMention): Promise<void> {
  console.log(`[mention-handler] Processing mention: @${mention.mentionedAgent} in ${mention.repository}`);

  // Check if this is a known agent type
  if (!isKnownAgent(mention.mentionedAgent)) {
    console.log(`[mention-handler] Unknown agent: @${mention.mentionedAgent}, checking workspace config`);
    // TODO: Check workspace configuration for custom agent names
    // For now, ignore unknown agents
    await db.commentMentions.markIgnored(mention.id);
    return;
  }

  // Update status to processing
  const agentId = `mention-${mention.id}`;
  const agentName = mention.mentionedAgent;
  await db.commentMentions.markProcessing(mention.id, agentId, agentName);

  // Build the prompt for the agent
  const prompt = buildMentionPrompt(mention);

  console.log(`[mention-handler] Built prompt for @${mention.mentionedAgent}:`);
  console.log(`[mention-handler] --- BEGIN PROMPT ---`);
  console.log(prompt);
  console.log(`[mention-handler] --- END PROMPT ---`);

  // TODO: Actually spawn or message the agent
  // This will integrate with the workspace/agent system to:
  // 1. Find an existing agent working on this PR/issue
  // 2. Message them if they exist
  // 3. Spawn a new agent if needed
  //
  // For now, we just log the intent
  console.log(`[mention-handler] Would spawn/message agent @${mention.mentionedAgent}`);
}

/**
 * Build a prompt for handling a mention
 */
function buildMentionPrompt(mention: CommentMention): string {
  const agentDescription = isKnownAgent(mention.mentionedAgent)
    ? KNOWN_AGENTS[mention.mentionedAgent]
    : 'Custom agent';

  const sourceTypeDescription = {
    issue_comment: 'GitHub issue comment',
    pr_comment: 'GitHub PR comment',
    pr_review: 'GitHub PR review comment',
  }[mention.sourceType] || 'GitHub comment';

  return `
# Agent Mention Task

You (@${mention.mentionedAgent}) have been mentioned in a ${sourceTypeDescription}.

## Your Role
${agentDescription}

## Context

**Repository:** ${mention.repository}
**Issue/PR:** #${mention.issueOrPrNumber}
**Comment by:** @${mention.authorLogin}
**Comment URL:** ${mention.commentUrl || 'N/A'}

## Comment

${mention.commentBody}

## Your Task

Analyze the comment and respond appropriately:

1. If a question was asked, provide a helpful answer
2. If a task was requested, either complete it or explain what's needed
3. If feedback was given, acknowledge it and act on it if needed
4. Reply to the comment on GitHub with your response

## Important

- Be concise and helpful
- If you need to make code changes, create a commit and push
- If the request is unclear, ask for clarification
- Reference specific files and line numbers when relevant
`.trim();
}

/**
 * Handle an issue assignment
 *
 * Called when an issue should be assigned to an agent
 */
export async function handleIssueAssignment(assignment: IssueAssignment): Promise<void> {
  console.log(`[mention-handler] Processing issue assignment: #${assignment.issueNumber} in ${assignment.repository}`);

  // Build prompt for the issue
  const prompt = buildIssuePrompt(assignment);

  console.log(`[mention-handler] Built prompt for issue #${assignment.issueNumber}:`);
  console.log(`[mention-handler] --- BEGIN PROMPT ---`);
  console.log(prompt);
  console.log(`[mention-handler] --- END PROMPT ---`);

  // TODO: Spawn agent for the issue
  console.log(`[mention-handler] Would spawn agent for issue #${assignment.issueNumber}`);
}

/**
 * Build a prompt for an issue assignment
 */
function buildIssuePrompt(assignment: IssueAssignment): string {
  const priorityNote = assignment.priority
    ? `\n**Priority:** ${assignment.priority.toUpperCase()}`
    : '';

  const labelsNote = assignment.labels && assignment.labels.length > 0
    ? `\n**Labels:** ${assignment.labels.join(', ')}`
    : '';

  return `
# Issue Assignment

You have been assigned to work on GitHub issue #${assignment.issueNumber}.

## Issue Details

**Repository:** ${assignment.repository}
**Title:** ${assignment.issueTitle}${priorityNote}${labelsNote}
**URL:** ${assignment.issueUrl || 'N/A'}

## Description

${assignment.issueBody || 'No description provided.'}

## Your Task

1. Analyze the issue and understand what needs to be done
2. Investigate the codebase to find relevant files
3. Implement a solution if possible
4. Create a PR with your changes
5. Link the PR to this issue

## Important

- Start with a comment on the issue acknowledging you're working on it
- If you need clarification, ask in the issue comments
- Create a draft PR early if the fix is complex
- Reference the issue number in your commit messages (e.g., "Fix #${assignment.issueNumber}")
`.trim();
}

/**
 * Get pending mentions for processing
 */
export async function getPendingMentions(limit = 50): Promise<CommentMention[]> {
  return db.commentMentions.findPending(limit);
}

/**
 * Get pending issue assignments for processing
 */
export async function getPendingIssueAssignments(limit = 50): Promise<IssueAssignment[]> {
  return db.issueAssignments.findPending(limit);
}

/**
 * Process all pending mentions (background job)
 */
export async function processPendingMentions(): Promise<number> {
  const pending = await getPendingMentions();
  let processed = 0;

  for (const mention of pending) {
    try {
      await handleMention(mention);
      processed++;
    } catch (error) {
      console.error(`[mention-handler] Failed to process mention ${mention.id}:`, error);
    }
  }

  return processed;
}

/**
 * Process all pending issue assignments (background job)
 */
export async function processPendingIssueAssignments(): Promise<number> {
  const pending = await getPendingIssueAssignments();
  let processed = 0;

  for (const assignment of pending) {
    try {
      await handleIssueAssignment(assignment);
      processed++;
    } catch (error) {
      console.error(`[mention-handler] Failed to process assignment ${assignment.id}:`, error);
    }
  }

  return processed;
}

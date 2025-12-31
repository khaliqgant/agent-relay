/**
 * Continuity Command Parser
 *
 * Parses `->continuity:` patterns from agent output.
 * Similar to how `->relay:` works for messaging.
 *
 * Supported patterns:
 *   ->continuity:save <<<...>>>
 *   ->continuity:load
 *   ->continuity:search "query"
 *   ->continuity:uncertain "item"
 *   ->continuity:handoff <<<...>>>
 */

import type { ContinuityCommand, Ledger, Decision, FileRef } from './types.js';

/**
 * Regex patterns for continuity commands
 */
const PATTERNS = {
  // ->continuity:save <<<...>>> or ->continuity:save --handoff <<<...>>>
  save: /->continuity:save(?:\s+(--handoff))?\s*<<<([\s\S]*?)>>>/,

  // ->continuity:load
  load: /->continuity:load\b/,

  // ->continuity:search "query" or ->continuity:search <<<query>>>
  search: /->continuity:search\s+(?:"([^"]+)"|<<<([\s\S]*?)>>>)/,

  // ->continuity:uncertain "item"
  uncertain: /->continuity:uncertain\s+"([^"]+)"/,

  // ->continuity:handoff <<<...>>> (explicit handoff creation)
  handoff: /->continuity:handoff\s*<<<([\s\S]*?)>>>/,
};

/**
 * Parse a continuity command from agent output
 */
export function parseContinuityCommand(output: string): ContinuityCommand | null {
  // Check for save command
  const saveMatch = output.match(PATTERNS.save);
  if (saveMatch) {
    return {
      type: 'save',
      content: saveMatch[2].trim(),
      createHandoff: saveMatch[1] === '--handoff',
    };
  }

  // Check for load command
  if (PATTERNS.load.test(output)) {
    return {
      type: 'load',
    };
  }

  // Check for search command
  const searchMatch = output.match(PATTERNS.search);
  if (searchMatch) {
    return {
      type: 'search',
      query: (searchMatch[1] || searchMatch[2]).trim(),
    };
  }

  // Check for uncertain command
  const uncertainMatch = output.match(PATTERNS.uncertain);
  if (uncertainMatch) {
    return {
      type: 'uncertain',
      item: uncertainMatch[1].trim(),
    };
  }

  // Check for handoff command
  const handoffMatch = output.match(PATTERNS.handoff);
  if (handoffMatch) {
    return {
      type: 'handoff',
      content: handoffMatch[1].trim(),
      createHandoff: true,
    };
  }

  return null;
}

/**
 * Check if output contains any continuity command
 */
export function hasContinuityCommand(output: string): boolean {
  return Object.values(PATTERNS).some((pattern) => pattern.test(output));
}

/**
 * Parse the content of a save command into ledger fields
 *
 * Expected format:
 *   Current task: <task>
 *   Completed: <item>, <item>, ...
 *   In progress: <item>, ...
 *   Blocked: <item>, ...
 *   Key decisions: <decision>
 *   Uncertain: <item>, ...
 *   Files: <path>:<lines>, ...
 */
export function parseSaveContent(content: string): Partial<Ledger> {
  const result: Partial<Ledger> = {
    completed: [],
    inProgress: [],
    blocked: [],
    keyDecisions: [],
    uncertainItems: [],
    fileContext: [],
  };

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match "Field: value" or "Field:" followed by list items
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const field = trimmed.slice(0, colonIndex).toLowerCase().trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    switch (field) {
      case 'current task':
      case 'task':
      case 'working on':
        result.currentTask = value;
        break;

      case 'completed':
      case 'done':
      case 'finished':
        result.completed = parseListValue(value);
        break;

      case 'in progress':
      case 'working':
      case 'ongoing':
        result.inProgress = parseListValue(value);
        break;

      case 'blocked':
      case 'blockers':
      case 'stuck':
        result.blocked = parseListValue(value);
        break;

      case 'key decision':
      case 'key decisions':
      case 'decisions':
      case 'decided':
        result.keyDecisions = parseDecisions(value);
        break;

      case 'uncertain':
      case 'unconfirmed':
      case 'needs verification':
      case 'to verify':
        result.uncertainItems = parseListValue(value);
        break;

      case 'files':
      case 'file context':
      case 'relevant files':
        result.fileContext = parseFileRefs(value);
        break;

      case 'next':
      case 'next steps':
      case 'todo':
        // Store next steps in inProgress for ledger
        result.inProgress = [...(result.inProgress || []), ...parseListValue(value)];
        break;
    }
  }

  return result;
}

/**
 * Parse a comma or newline separated list
 */
function parseListValue(value: string): string[] {
  if (!value) return [];

  // Handle both comma-separated and newline-separated
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith('-') && item !== '-')
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Parse decisions from value
 */
function parseDecisions(value: string): Decision[] {
  const items = parseListValue(value);
  return items.map((item) => ({
    decision: item,
    timestamp: new Date(),
  }));
}

/**
 * Parse file references from value
 * Format: path:startLine-endLine, path, path:line
 */
function parseFileRefs(value: string): FileRef[] {
  const items = parseListValue(value);
  return items.map((item) => {
    // Match path:startLine-endLine or path:line or just path
    const match = item.match(/^([^:]+)(?::(\d+)(?:-(\d+))?)?$/);
    if (!match) {
      return { path: item.trim() };
    }

    const ref: FileRef = { path: match[1].trim() };
    if (match[2]) {
      const startLine = parseInt(match[2]);
      const endLine = match[3] ? parseInt(match[3]) : startLine;
      ref.lines = [startLine, endLine];
    }
    return ref;
  });
}

/**
 * Parse handoff content (similar to save but for permanent handoffs)
 *
 * Expected format:
 *   Summary: <summary>
 *   Task: <task description>
 *   Completed: <item>, ...
 *   Next steps: <item>, ...
 *   Key decisions: <decision>, ...
 *   Files: <path>, ...
 *   Learnings: <learning>, ...
 */
export interface ParsedHandoffContent {
  summary?: string;
  taskDescription?: string;
  completedWork: string[];
  nextSteps: string[];
  decisions: Decision[];
  fileReferences: FileRef[];
  learnings: string[];
}

export function parseHandoffContent(content: string): ParsedHandoffContent {
  const result: ParsedHandoffContent = {
    completedWork: [],
    nextSteps: [],
    decisions: [],
    fileReferences: [],
    learnings: [],
  };

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const field = trimmed.slice(0, colonIndex).toLowerCase().trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    switch (field) {
      case 'summary':
        result.summary = value;
        break;

      case 'task':
      case 'task description':
        result.taskDescription = value;
        break;

      case 'completed':
      case 'done':
        result.completedWork = parseListValue(value);
        break;

      case 'next':
      case 'next steps':
      case 'todo':
        result.nextSteps = parseListValue(value);
        break;

      case 'decisions':
      case 'key decisions':
        result.decisions = parseDecisions(value);
        break;

      case 'files':
        result.fileReferences = parseFileRefs(value);
        break;

      case 'learnings':
      case 'learned':
        result.learnings = parseListValue(value);
        break;
    }
  }

  return result;
}

/**
 * Extract all continuity commands from a block of output
 * (in case multiple commands are present)
 */
export function extractAllCommands(output: string): ContinuityCommand[] {
  const commands: ContinuityCommand[] = [];

  // Find all save commands
  const saveRegex = new RegExp(PATTERNS.save.source, 'g');
  let match;
  while ((match = saveRegex.exec(output)) !== null) {
    commands.push({
      type: 'save',
      content: match[2].trim(),
      createHandoff: match[1] === '--handoff',
    });
  }

  // Find load commands
  if (PATTERNS.load.test(output)) {
    commands.push({ type: 'load' });
  }

  // Find search commands
  const searchRegex = new RegExp(PATTERNS.search.source, 'g');
  while ((match = searchRegex.exec(output)) !== null) {
    commands.push({
      type: 'search',
      query: (match[1] || match[2]).trim(),
    });
  }

  // Find uncertain commands
  const uncertainRegex = new RegExp(PATTERNS.uncertain.source, 'g');
  while ((match = uncertainRegex.exec(output)) !== null) {
    commands.push({
      type: 'uncertain',
      item: match[1].trim(),
    });
  }

  // Find handoff commands
  const handoffRegex = new RegExp(PATTERNS.handoff.source, 'g');
  while ((match = handoffRegex.exec(output)) !== null) {
    commands.push({
      type: 'handoff',
      content: match[1].trim(),
      createHandoff: true,
    });
  }

  return commands;
}

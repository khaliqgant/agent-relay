/**
 * PTY Output Parser
 * Extracts relay commands from agent terminal output.
 *
 * Supports two formats:
 * 1. Inline: @relay:<target> <message> (single line, start of line only)
 * 2. Block: [[RELAY]]{ json }[[/RELAY]] (multi-line, structured)
 *
 * Rules:
 * - Inline only matches at start of line (after whitespace)
 * - Ignores content inside code fences
 * - Escape with \@relay: to output literal
 * - Block format is preferred for structured data
 */

import type { PayloadKind } from '../protocol/types.js';

export interface ParsedCommand {
  to: string;
  kind: PayloadKind;
  body: string;
  data?: Record<string, unknown>;
  raw: string;
}

export interface ParserOptions {
  maxBlockBytes?: number;
  enableInline?: boolean;
  enableBlock?: boolean;
}

const DEFAULT_OPTIONS: Required<ParserOptions> = {
  maxBlockBytes: 1024 * 1024, // 1 MiB
  enableInline: true,
  enableBlock: true,
};

// Patterns
// Allow common input prefixes: >, $, %, #, →, ➜, bullets (●•◦‣⁃-*⏺◆◇○□■), and their variations
const INLINE_RELAY = /^(?:\s*(?:[>$%#→➜›»●•◦‣⁃\-*⏺◆◇○□■]\s*)*)?@relay:(\S+)\s+(.+)$/;
const INLINE_THINKING = /^(?:\s*(?:[>$%#→➜›»●•◦‣⁃\-*⏺◆◇○□■]\s*)*)?@thinking:(\S+)\s+(.+)$/;
const BLOCK_END = /\[\[\/RELAY\]\]/;
const CODE_FENCE = /^```/;
const ESCAPE_PREFIX = /^(\s*)\\@(relay|thinking):/;

// ANSI escape sequence pattern for stripping
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\r/g;

/**
 * Strip ANSI escape codes from a string for pattern matching.
 */
function stripAnsi(str: string): string {
  return str.replace(ANSI_PATTERN, '');
}

export class OutputParser {
  private options: Required<ParserOptions>;
  private inCodeFence = false;
  private inBlock = false;
  private blockBuffer = '';

  constructor(options: ParserOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Push data into the parser and extract commands.
   * Returns array of parsed commands and cleaned output.
   *
   * Design: Pass through data with minimal buffering to preserve terminal rendering.
   * Only buffer content when inside [[RELAY]]...[[/RELAY]] blocks.
   */
  parse(data: string): { commands: ParsedCommand[]; output: string } {
    const commands: ParsedCommand[] = [];
    let output = '';

    // If we're inside a block, accumulate until we see the end
    if (this.inBlock) {
      return this.parseInBlockMode(data, commands);
    }

    // Find [[RELAY]] that's at the start of a line (or start of input)
    // and NOT inside a code fence
    const blockStartIdx = this.findBlockStart(data);

    if (this.options.enableBlock && blockStartIdx !== -1) {
      const before = data.substring(0, blockStartIdx);
      const after = data.substring(blockStartIdx + '[[RELAY]]'.length);

      // Output everything before the block start
      if (before) {
        const beforeResult = this.parsePassThrough(before, commands);
        output += beforeResult;
      }

      // Enter block mode
      this.inBlock = true;
      this.blockBuffer = after;

      // Check size limit before processing
      if (this.blockBuffer.length > this.options.maxBlockBytes) {
        console.error('[parser] Block too large, discarding');
        this.inBlock = false;
        this.blockBuffer = '';
        return { commands, output };
      }

      // Check if block ends in same chunk
      if (BLOCK_END.test(this.blockBuffer)) {
        const blockResult = this.finishBlock();
        if (blockResult.command) {
          commands.push(blockResult.command);
        }
        if (blockResult.remaining) {
          // Recursively parse anything after the block
          const afterResult = this.parse(blockResult.remaining);
          commands.push(...afterResult.commands);
          output += afterResult.output;
        }
      }

      return { commands, output };
    }

    // Pass-through mode: output data immediately, only parse complete lines for relay commands
    output = this.parsePassThrough(data, commands);
    return { commands, output };
  }

  /**
   * Find [[RELAY]] that's at the start of a line and not inside a code fence.
   * Returns the index, or -1 if not found.
   */
  private findBlockStart(data: string): number {
    // Track code fence state through the data
    let inFence = this.inCodeFence;
    let searchStart = 0;

    while (searchStart < data.length) {
      // Look for next [[RELAY]] or code fence
      const relayIdx = data.indexOf('[[RELAY]]', searchStart);
      const fenceIdx = data.indexOf('```', searchStart);

      // No more [[RELAY]] found
      if (relayIdx === -1) {
        // Still update code fence state for remaining data
        while (fenceIdx !== -1) {
          const nextFence = data.indexOf('```', searchStart);
          if (nextFence === -1) break;
          inFence = !inFence;
          searchStart = nextFence + 3;
        }
        return -1;
      }

      // Process any code fences before this [[RELAY]]
      let tempIdx = searchStart;
      while (true) {
        const nextFence = data.indexOf('```', tempIdx);
        if (nextFence === -1 || nextFence >= relayIdx) break;
        inFence = !inFence;
        tempIdx = nextFence + 3;
      }

      // If we're inside a code fence, skip this [[RELAY]]
      if (inFence) {
        searchStart = relayIdx + 9; // Skip past [[RELAY]]
        continue;
      }

      // Check if [[RELAY]] is at start of a line
      if (relayIdx === 0) {
        return 0; // At very start
      }

      // Look backwards for the start of line
      const beforeRelay = data.substring(0, relayIdx);
      const lastNewline = beforeRelay.lastIndexOf('\n');
      const lineStart = beforeRelay.substring(lastNewline + 1);

      // Must be only whitespace before [[RELAY]] on this line
      if (/^\s*$/.test(lineStart)) {
        return relayIdx;
      }

      // Not at start of line, keep searching
      searchStart = relayIdx + 9;
    }

    return -1;
  }

  /**
   * Parse data in pass-through mode - TRUE pass-through for terminal rendering.
   * Output is exactly the input data, minus any relay command lines found in this chunk.
   * No cross-chunk buffering to avoid double-output issues.
   *
   * IMPORTANT: We ONLY parse complete lines (i.e. those terminated by `\n` in the
   * current chunk). The final unterminated line (if any) is passed through without
   * parsing. This intentionally avoids cross-chunk detection when a line is split
   * across chunks.
   */
  private parsePassThrough(data: string, commands: ParsedCommand[]): string {
    // Simple approach: split data, check each line (complete or not), rebuild output
    const lines = data.split('\n');
    const hasTrailingNewline = data.endsWith('\n');

    const outputLines: string[] = [];
    let strippedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;

      // Skip the empty string after a trailing newline
      if (isLastLine && hasTrailingNewline && line === '') {
        continue;
      }

      // If the chunk does NOT end in a newline, the last line is incomplete.
      // Pass it through unmodified and do not attempt to parse it.
      if (isLastLine && !hasTrailingNewline) {
        outputLines.push(line);
        continue;
      }

      if (line.length > 0) {
        // Only check complete lines for relay commands.
        const result = this.processLine(line);
        if (result.command) {
          commands.push(result.command);
        }
        if (result.output !== null) {
          outputLines.push(result.output);
        } else {
          // Line was stripped (relay command)
          strippedCount++;
        }
      } else {
        // Empty line - preserve it
        outputLines.push('');
      }
    }

    // Rebuild output
    if (outputLines.length === 0 && strippedCount > 0) {
      // All lines were relay commands - return empty
      return '';
    }

    let output = outputLines.join('\n');

    // Add trailing newline if original had one AND we have content
    if (hasTrailingNewline && outputLines.length > 0) {
      output += '\n';
    }

    return output;
  }

  /**
   * Parse while inside a [[RELAY]] block - buffer until we see [[/RELAY]].
   */
  private parseInBlockMode(data: string, commands: ParsedCommand[]): { commands: ParsedCommand[]; output: string } {
    this.blockBuffer += data;

    // Check size limit
    if (this.blockBuffer.length > this.options.maxBlockBytes) {
      console.error('[parser] Block too large, discarding');
      this.inBlock = false;
      this.blockBuffer = '';
      return { commands, output: '' };
    }

    // Check for block end
    if (BLOCK_END.test(this.blockBuffer)) {
      const result = this.finishBlock();
      if (result.command) {
        commands.push(result.command);
      }

      let output = '';
      if (result.remaining) {
        // Recursively parse anything after the block
        const afterResult = this.parse(result.remaining);
        commands.push(...afterResult.commands);
        output = afterResult.output;
      }

      return { commands, output };
    }

    // Still inside block, no output yet
    return { commands, output: '' };
  }

  /**
   * Process a single complete line for inline relay commands.
   * Block handling is done at the parse() level, not here.
   *
   * IMPORTANT: We strip ANSI codes for pattern matching, but preserve
   * the original line for output to maintain terminal rendering.
   */
  private processLine(line: string): { command: ParsedCommand | null; output: string | null } {
    // Strip ANSI codes for pattern matching
    const stripped = stripAnsi(line);

    // Handle code fences
    if (CODE_FENCE.test(stripped)) {
      this.inCodeFence = !this.inCodeFence;
      return { command: null, output: line };
    }

    // Inside code fence - pass through
    if (this.inCodeFence) {
      return { command: null, output: line };
    }

    // Check for escaped inline (on stripped text)
    const escapeMatch = stripped.match(ESCAPE_PREFIX);
    if (escapeMatch) {
      // Output with escape removed
      const unescaped = line.replace(/\\@/, '@');
      return { command: null, output: unescaped };
    }

    // Check for inline relay (on stripped text)
    if (this.options.enableInline) {
      const relayMatch = stripped.match(INLINE_RELAY);
      if (relayMatch) {
        const [raw, target, body] = relayMatch;
        return {
          command: {
            to: target,
            kind: 'message',
            body,
            raw,
          },
          output: null, // Don't output relay commands
        };
      }

      const thinkingMatch = stripped.match(INLINE_THINKING);
      if (thinkingMatch) {
        const [raw, target, body] = thinkingMatch;
        return {
          command: {
            to: target,
            kind: 'thinking',
            body,
            raw,
          },
          output: null,
        };
      }
    }

    // Regular line
    return { command: null, output: line };
  }

  /**
   * Finish processing a block and extract command.
   * Returns the command (if valid) and any remaining content after [[/RELAY]].
   */
  private finishBlock(): { command: ParsedCommand | null; remaining: string | null } {
    const endIdx = this.blockBuffer.indexOf('[[/RELAY]]');
    const jsonStr = this.blockBuffer.substring(0, endIdx).trim();
    const remaining = this.blockBuffer.substring(endIdx + '[[/RELAY]]'.length) || null;

    this.inBlock = false;
    this.blockBuffer = '';

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate required fields
      if (!parsed.to || !parsed.type) {
        console.error('[parser] Block missing required fields (to, type)');
        return { command: null, remaining };
      }

      return {
        command: {
          to: parsed.to,
          kind: parsed.type as PayloadKind,
          body: parsed.body ?? parsed.text ?? '',
          data: parsed.data,
          raw: jsonStr,
        },
        remaining,
      };
    } catch (err) {
      console.error('[parser] Invalid JSON in block:', err);
      return { command: null, remaining };
    }
  }

  /**
   * Flush any remaining buffer (call on stream end).
   */
  flush(): { commands: ParsedCommand[]; output: string } {
    const result = this.parse('\n');
    this.inBlock = false;
    this.blockBuffer = '';
    this.inCodeFence = false;
    return result;
  }

  /**
   * Reset parser state.
   */
  reset(): void {
    this.inBlock = false;
    this.blockBuffer = '';
    this.inCodeFence = false;
  }
}

/**
 * Format a relay command for injection into agent input.
 */
export function formatIncomingMessage(from: string, body: string, kind: PayloadKind = 'message'): string {
  const prefix = kind === 'thinking' ? '[THINKING]' : '[MSG]';
  return `\n${prefix} from ${from}: ${body}\n`;
}

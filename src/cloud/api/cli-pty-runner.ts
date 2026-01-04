/**
 * CLI PTY Runner
 *
 * Shared module for running CLI auth flows via PTY.
 * Used by both production (onboarding.ts) and tests (ci-test-real-clis.ts).
 *
 * This module has minimal dependencies (only node-pty) so it can be
 * used in isolated test containers without the full server stack.
 */

import * as pty from 'node-pty';

// Import shared config and utilities
import {
  CLI_AUTH_CONFIG,
  stripAnsiCodes,
  matchesSuccessPattern,
  findMatchingPrompt,
  validateProviderConfig,
  validateAllProviderConfigs as validateAllConfigs,
  getSupportedProviders,
  type CLIAuthConfig,
  type PromptHandler,
} from '../../shared/cli-auth-config.js';

// Re-export everything from shared config for backward compatibility
export {
  CLI_AUTH_CONFIG,
  stripAnsiCodes,
  matchesSuccessPattern,
  findMatchingPrompt,
  validateProviderConfig,
  getSupportedProviders,
  type CLIAuthConfig,
  type PromptHandler,
};

// Wrapper that throws instead of returning array (backward compatible)
export function validateAllProviderConfigs(): void {
  const errors = validateAllConfigs();
  if (errors.length > 0) {
    throw new Error(`Invalid provider configurations:\n${errors.join('\n')}`);
  }
}

/**
 * Result of running a CLI auth flow via PTY
 */
export interface PTYAuthResult {
  authUrl: string | null;
  success: boolean;
  promptsHandled: string[];
  output: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Options for running CLI auth via PTY
 */
export interface PTYAuthOptions {
  /** Callback when auth URL is found */
  onAuthUrl?: (url: string) => void;
  /** Callback when a prompt is handled */
  onPromptHandled?: (description: string) => void;
  /** Callback for raw PTY output */
  onOutput?: (data: string) => void;
  /** Environment variables override */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
}

/**
 * Run CLI auth flow via PTY
 *
 * This is the core PTY runner used by both production and tests.
 * It handles:
 * - Spawning the CLI with proper TTY emulation
 * - Auto-responding to interactive prompts
 * - Extracting auth URLs from output
 * - Detecting success patterns
 *
 * @param config - CLI auth configuration for the provider
 * @param options - Optional callbacks and overrides
 * @returns Promise resolving to auth result
 */
export async function runCLIAuthViaPTY(
  config: CLIAuthConfig,
  options: PTYAuthOptions = {}
): Promise<PTYAuthResult> {
  const result: PTYAuthResult = {
    authUrl: null,
    success: false,
    promptsHandled: [],
    output: '',
    exitCode: null,
  };

  const respondedPrompts = new Set<string>();

  return new Promise((resolve) => {
    try {
      const proc = pty.spawn(config.command, config.args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          NO_COLOR: '1',
          TERM: 'xterm-256color',
          // Prevent CLIs from trying to open browsers
          BROWSER: 'echo',
          DISPLAY: '',
          ...options.env,
        } as Record<string, string>,
      });

      // Timeout handler
      const timeout = setTimeout(() => {
        proc.kill();
        result.error = 'Timeout waiting for auth URL';
        resolve(result);
      }, config.waitTimeout + 5000);

      proc.onData((data: string) => {
        result.output += data;
        options.onOutput?.(data);

        // Check for matching prompts and auto-respond
        const matchingPrompt = findMatchingPrompt(data, config.prompts, respondedPrompts);
        if (matchingPrompt) {
          respondedPrompts.add(matchingPrompt.description);
          result.promptsHandled.push(matchingPrompt.description);
          options.onPromptHandled?.(matchingPrompt.description);

          const delay = matchingPrompt.delay ?? 100;
          setTimeout(() => {
            try {
              proc.write(matchingPrompt.response);
            } catch {
              // Process may have exited
            }
          }, delay);
        }

        // Look for auth URL
        const cleanText = stripAnsiCodes(data);
        const match = cleanText.match(config.urlPattern);
        if (match && match[1] && !result.authUrl) {
          result.authUrl = match[1];
          options.onAuthUrl?.(result.authUrl);
        }

        // Check for success indicators
        if (matchesSuccessPattern(data, config.successPatterns)) {
          result.success = true;
        }
      });

      proc.onExit(({ exitCode }) => {
        clearTimeout(timeout);
        result.exitCode = exitCode;

        // Consider it a success if we got a URL (main goal)
        // or if exit code was 0 with success pattern
        if (result.authUrl || (exitCode === 0 && result.success)) {
          result.success = true;
        }

        if (!result.authUrl && !result.success && !result.error) {
          result.error = 'Failed to extract auth URL from CLI output';
        }

        resolve(result);
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Unknown error';
      resolve(result);
    }
  });
}


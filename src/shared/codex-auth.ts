/**
 * Codex Authentication Module
 *
 * Standardized authentication for OpenAI Codex following official patterns:
 * - Environment variable support (OPENAI_API_KEY)
 * - Config file loading from ~/.codex/
 * - Multi-provider support with baseURL + envKey pattern
 * - .env file support via dotenv
 *
 * Based on: https://github.com/openai/codex
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'yaml';

/**
 * Provider configuration following Codex pattern
 */
export interface CodexProviderConfig {
  /** Display name for the provider */
  name: string;
  /** Base URL for the API service */
  baseURL: string;
  /** Environment variable name holding the API key */
  envKey: string;
}

/**
 * Codex config file structure (from ~/.codex/config.yaml or config.json)
 */
export interface CodexConfig {
  /** Model to use (default: o4-mini) */
  model?: string;
  /** Approval mode: suggest, auto-edit, full-auto */
  approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
  /** Error handling in full-auto mode */
  fullAutoErrorMode?: 'ask-user' | 'ignore-and-continue';
  /** Enable desktop notifications */
  notify?: boolean;
  /** Custom provider configurations */
  providers?: Record<string, CodexProviderConfig>;
  /** History settings */
  history?: {
    maxSize?: number;
    saveHistory?: boolean;
    sensitivePatterns?: string[];
  };
}

/**
 * Codex auth credentials (from ~/.codex/auth.json)
 */
export interface CodexAuthCredentials {
  /** OAuth tokens */
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    token_type?: string;
  };
  /** Legacy API key format */
  OPENAI_API_KEY?: string;
}

/**
 * Authentication result
 */
export interface CodexAuthResult {
  authenticated: boolean;
  method: 'env' | 'config' | 'oauth' | 'none';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  provider?: string;
  baseURL?: string;
}

/**
 * Default provider configurations matching Codex CLI
 */
export const DEFAULT_PROVIDERS: Record<string, CodexProviderConfig> = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
  },
  azure: {
    name: 'Azure OpenAI',
    baseURL: '', // User must configure
    envKey: 'AZURE_OPENAI_API_KEY',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },
  gemini: {
    name: 'Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
  },
  ollama: {
    name: 'Ollama',
    baseURL: 'http://localhost:11434/v1',
    envKey: 'OLLAMA_API_KEY',
  },
  mistral: {
    name: 'Mistral',
    baseURL: 'https://api.mistral.ai/v1',
    envKey: 'MISTRAL_API_KEY',
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
  },
  xai: {
    name: 'xAI',
    baseURL: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
  },
  groq: {
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
  },
  arceeai: {
    name: 'ArceeAI',
    baseURL: 'https://conductor.arcee.ai/v1',
    envKey: 'ARCEE_API_KEY',
  },
};

/**
 * Standard paths for Codex configuration
 */
export const CODEX_PATHS = {
  configDir: path.join(os.homedir(), '.codex'),
  authFile: path.join(os.homedir(), '.codex', 'auth.json'),
  configYaml: path.join(os.homedir(), '.codex', 'config.yaml'),
  configJson: path.join(os.homedir(), '.codex', 'config.json'),
};

/**
 * Load .env file from project root if it exists
 */
export async function loadDotEnv(projectRoot?: string): Promise<void> {
  const envPath = path.join(projectRoot || process.cwd(), '.env');

  try {
    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        // Don't override existing env vars
        if (!process.env[key]) {
          process.env[key] = cleanValue;
        }
      }
    }
  } catch {
    // .env file doesn't exist or can't be read - that's OK
  }
}

/**
 * Load Codex config from ~/.codex/config.yaml or config.json
 */
export async function loadCodexConfig(): Promise<CodexConfig | null> {
  // Try YAML first (preferred by Codex)
  try {
    const content = await fs.readFile(CODEX_PATHS.configYaml, 'utf8');
    return yaml.parse(content) as CodexConfig;
  } catch {
    // YAML doesn't exist, try JSON
  }

  // Try JSON
  try {
    const content = await fs.readFile(CODEX_PATHS.configJson, 'utf8');
    return JSON.parse(content) as CodexConfig;
  } catch {
    // No config file found
  }

  return null;
}

/**
 * Load Codex OAuth credentials from ~/.codex/auth.json
 */
export async function loadCodexAuth(): Promise<CodexAuthCredentials | null> {
  try {
    const content = await fs.readFile(CODEX_PATHS.authFile, 'utf8');
    return JSON.parse(content) as CodexAuthCredentials;
  } catch {
    return null;
  }
}

/**
 * Save Codex OAuth credentials to ~/.codex/auth.json
 */
export async function saveCodexAuth(
  credentials: CodexAuthCredentials
): Promise<void> {
  // Ensure config directory exists
  await fs.mkdir(CODEX_PATHS.configDir, { recursive: true });
  await fs.writeFile(
    CODEX_PATHS.authFile,
    JSON.stringify(credentials, null, 2),
    'utf8'
  );
}

/**
 * Get authentication for Codex/OpenAI
 *
 * Priority order (matching official Codex CLI):
 * 1. OPENAI_API_KEY environment variable
 * 2. OAuth tokens from ~/.codex/auth.json
 * 3. API key from config file
 *
 * @param projectRoot - Optional project root for .env loading
 */
export async function getCodexAuth(
  projectRoot?: string
): Promise<CodexAuthResult> {
  // Load .env file first
  await loadDotEnv(projectRoot);

  // 1. Check environment variable (highest priority)
  const envApiKey = process.env.OPENAI_API_KEY;
  if (envApiKey) {
    return {
      authenticated: true,
      method: 'env',
      apiKey: envApiKey,
      provider: 'openai',
      baseURL: DEFAULT_PROVIDERS.openai.baseURL,
    };
  }

  // 2. Check OAuth credentials from auth.json
  const authCredentials = await loadCodexAuth();
  if (authCredentials?.tokens?.access_token) {
    return {
      authenticated: true,
      method: 'oauth',
      accessToken: authCredentials.tokens.access_token,
      refreshToken: authCredentials.tokens.refresh_token,
      expiresAt: authCredentials.tokens.expires_at
        ? new Date(authCredentials.tokens.expires_at)
        : undefined,
      provider: 'openai',
      baseURL: DEFAULT_PROVIDERS.openai.baseURL,
    };
  }

  // 3. Check for API key in auth.json (legacy format)
  if (authCredentials?.OPENAI_API_KEY) {
    return {
      authenticated: true,
      method: 'config',
      apiKey: authCredentials.OPENAI_API_KEY,
      provider: 'openai',
      baseURL: DEFAULT_PROVIDERS.openai.baseURL,
    };
  }

  // Not authenticated
  return {
    authenticated: false,
    method: 'none',
  };
}

/**
 * Get authentication for any supported provider
 *
 * @param providerId - Provider ID (e.g., 'openai', 'azure', 'openrouter')
 * @param projectRoot - Optional project root for .env loading
 */
export async function getProviderAuth(
  providerId: string,
  projectRoot?: string
): Promise<CodexAuthResult> {
  // Load .env file first
  await loadDotEnv(projectRoot);

  // Load custom config
  const config = await loadCodexConfig();

  // Get provider config (custom or default)
  const providers = { ...DEFAULT_PROVIDERS, ...config?.providers };
  const providerConfig = providers[providerId];

  if (!providerConfig) {
    return {
      authenticated: false,
      method: 'none',
    };
  }

  // Check environment variable for this provider
  const apiKey = process.env[providerConfig.envKey];
  if (apiKey) {
    return {
      authenticated: true,
      method: 'env',
      apiKey,
      provider: providerId,
      baseURL: providerConfig.baseURL,
    };
  }

  // For OpenAI, also check OAuth credentials
  if (providerId === 'openai') {
    return getCodexAuth(projectRoot);
  }

  return {
    authenticated: false,
    method: 'none',
    provider: providerId,
    baseURL: providerConfig.baseURL,
  };
}

/**
 * Check if Codex is authenticated (quick check)
 */
export async function isCodexAuthenticated(
  projectRoot?: string
): Promise<boolean> {
  const result = await getCodexAuth(projectRoot);
  return result.authenticated;
}

/**
 * Get the API key or access token for making requests
 *
 * @returns The API key/token to use in Authorization header
 */
export async function getCodexToken(
  projectRoot?: string
): Promise<string | null> {
  const auth = await getCodexAuth(projectRoot);
  if (!auth.authenticated) return null;
  return auth.apiKey || auth.accessToken || null;
}

/**
 * Validate an API key by making a test request
 *
 * @param apiKey - The API key to validate
 * @param baseURL - Optional custom base URL
 */
export async function validateApiKey(
  apiKey: string,
  baseURL = DEFAULT_PROVIDERS.openai.baseURL
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (response.status === 403) {
      return { valid: false, error: 'API key does not have access' };
    }

    return { valid: false, error: `Unexpected response: ${response.status}` };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Get all configured providers with their auth status
 */
export async function getProviderStatuses(
  projectRoot?: string
): Promise<
  Array<{
    id: string;
    name: string;
    baseURL: string;
    authenticated: boolean;
    method: CodexAuthResult['method'];
  }>
> {
  await loadDotEnv(projectRoot);
  const config = await loadCodexConfig();
  const providers = { ...DEFAULT_PROVIDERS, ...config?.providers };

  const results = [];
  for (const [id, provider] of Object.entries(providers)) {
    const auth = await getProviderAuth(id, projectRoot);
    results.push({
      id,
      name: provider.name,
      baseURL: provider.baseURL,
      authenticated: auth.authenticated,
      method: auth.method,
    });
  }

  return results;
}

/**
 * Export environment variable name for documentation
 */
export const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

/**
 * Tests for the standardized Codex authentication module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock node modules before importing the module under test
vi.mock('node:fs/promises');
vi.mock('node:os', () => ({
  homedir: () => '/mock/home',
}));

// Import after mocks are set up
import {
  loadCodexConfig,
  loadCodexAuth,
  getCodexAuth,
  getCodexOAuth,
  getProviderAuth,
  isCodexAuthenticated,
  getCodexToken,
  validateApiKey,
  getProviderStatuses,
  DEFAULT_PROVIDERS,
  CODEX_PATHS,
  CODEX_OAUTH,
  OPENAI_API_KEY_ENV,
  loadDotEnv,
} from '../../src/shared/codex-auth.js';

describe('Codex Auth Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEFAULT_PROVIDERS', () => {
    it('should include OpenAI provider', () => {
      expect(DEFAULT_PROVIDERS.openai).toBeDefined();
      expect(DEFAULT_PROVIDERS.openai.name).toBe('OpenAI');
      expect(DEFAULT_PROVIDERS.openai.baseURL).toBe('https://api.openai.com/v1');
      expect(DEFAULT_PROVIDERS.openai.envKey).toBe('OPENAI_API_KEY');
    });

    it('should include all expected providers', () => {
      const expectedProviders = [
        'openai',
        'azure',
        'openrouter',
        'gemini',
        'ollama',
        'mistral',
        'deepseek',
        'xai',
        'groq',
        'arceeai',
      ];
      for (const provider of expectedProviders) {
        expect(DEFAULT_PROVIDERS[provider]).toBeDefined();
      }
    });
  });

  describe('CODEX_PATHS', () => {
    it('should define correct paths', () => {
      expect(CODEX_PATHS.configDir).toBe('/mock/home/.codex');
      expect(CODEX_PATHS.authFile).toBe('/mock/home/.codex/auth.json');
      expect(CODEX_PATHS.configYaml).toBe('/mock/home/.codex/config.yaml');
      expect(CODEX_PATHS.configJson).toBe('/mock/home/.codex/config.json');
    });
  });

  describe('OPENAI_API_KEY_ENV', () => {
    it('should be OPENAI_API_KEY', () => {
      expect(OPENAI_API_KEY_ENV).toBe('OPENAI_API_KEY');
    });
  });

  describe('CODEX_OAUTH', () => {
    it('should define OAuth endpoints', () => {
      expect(CODEX_OAUTH.authBaseUrl).toBe('https://auth.openai.com');
      expect(CODEX_OAUTH.deviceCodeEndpoint).toBe('/deviceauth/usercode');
      expect(CODEX_OAUTH.tokenEndpoint).toBe('/deviceauth/token');
      expect(CODEX_OAUTH.callbackEndpoint).toBe('/deviceauth/callback');
      expect(CODEX_OAUTH.pollingTimeoutMs).toBe(15 * 60 * 1000);
      expect(CODEX_OAUTH.pollingIntervalMs).toBe(5000);
    });
  });

  describe('getCodexAuth', () => {
    it('should prioritize OAuth tokens over env vars (OAuth-first)', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-123';
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('auth.json')) {
          return JSON.stringify({
            tokens: {
              access_token: 'oauth-access-token',
              refresh_token: 'oauth-refresh-token',
              expires_at: Date.now() + 3600000,
            },
          });
        }
        throw new Error('ENOENT');
      });

      const result = await getCodexAuth();

      // OAuth should take priority over env var
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('oauth');
      expect(result.accessToken).toBe('oauth-access-token');
    });

    it('should return oauth-based auth when auth.json has tokens', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('auth.json')) {
          return JSON.stringify({
            tokens: {
              access_token: 'oauth-access-token',
              refresh_token: 'oauth-refresh-token',
              expires_at: Date.now() + 3600000,
            },
          });
        }
        throw new Error('ENOENT');
      });

      const result = await getCodexAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('oauth');
      expect(result.accessToken).toBe('oauth-access-token');
      expect(result.refreshToken).toBe('oauth-refresh-token');
    });

    it('should fall back to env var when no OAuth tokens', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-123';
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getCodexAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('env');
      expect(result.apiKey).toBe('sk-test-key-123');
    });

    it('should return config-based auth when auth.json has OPENAI_API_KEY', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('auth.json')) {
          return JSON.stringify({
            OPENAI_API_KEY: 'config-api-key',
          });
        }
        throw new Error('ENOENT');
      });

      const result = await getCodexAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('config');
      expect(result.apiKey).toBe('config-api-key');
    });

    it('should return not authenticated when no credentials found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getCodexAuth();

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe('none');
    });

    it('should skip expired OAuth tokens and fall back to env var', async () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('auth.json')) {
          return JSON.stringify({
            tokens: {
              access_token: 'expired-token',
              expires_at: Date.now() - 3600000, // Expired 1 hour ago
            },
          });
        }
        throw new Error('ENOENT');
      });

      const result = await getCodexAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('env');
      expect(result.apiKey).toBe('env-api-key');
    });
  });

  describe('getCodexOAuth', () => {
    it('should return OAuth auth only, ignoring env vars', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-123';
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('auth.json')) {
          return JSON.stringify({
            tokens: {
              access_token: 'oauth-access-token',
              expires_at: Date.now() + 3600000,
            },
          });
        }
        throw new Error('ENOENT');
      });

      const result = await getCodexOAuth();

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('oauth');
      expect(result.accessToken).toBe('oauth-access-token');
    });

    it('should return not authenticated when no OAuth (even if env var exists)', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-123';
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getCodexOAuth();

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe('none');
    });
  });

  describe('getProviderAuth', () => {
    it('should return auth for other providers via env var', async () => {
      process.env.GROQ_API_KEY = 'groq-api-key';
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getProviderAuth('groq');

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('env');
      expect(result.apiKey).toBe('groq-api-key');
      expect(result.provider).toBe('groq');
      expect(result.baseURL).toBe('https://api.groq.com/openai/v1');
    });

    it('should return not authenticated for unknown provider', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getProviderAuth('unknown-provider');

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe('none');
    });
  });

  describe('isCodexAuthenticated', () => {
    it('should return true when authenticated', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await isCodexAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when not authenticated', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await isCodexAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('getCodexToken', () => {
    it('should return API key when set via env', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const token = await getCodexToken();

      expect(token).toBe('sk-test-key');
    });

    it('should return null when not authenticated', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const token = await getCodexToken();

      expect(token).toBeNull();
    });
  });

  describe('loadCodexConfig', () => {
    it('should load YAML config', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('config.yaml')) {
          return 'model: gpt-4\napprovalMode: suggest';
        }
        throw new Error('ENOENT');
      });

      const config = await loadCodexConfig();

      expect(config).toEqual({
        model: 'gpt-4',
        approvalMode: 'suggest',
      });
    });

    it('should fall back to JSON config', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('config.yaml')) {
          throw new Error('ENOENT');
        }
        if (String(filePath).endsWith('config.json')) {
          return JSON.stringify({ model: 'gpt-4' });
        }
        throw new Error('ENOENT');
      });

      const config = await loadCodexConfig();

      expect(config).toEqual({ model: 'gpt-4' });
    });

    it('should return null when no config exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const config = await loadCodexConfig();

      expect(config).toBeNull();
    });
  });

  describe('loadDotEnv', () => {
    it('should load .env file and set environment variables', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('.env')) {
          return 'OPENAI_API_KEY=dotenv-key\nOTHER_VAR=value';
        }
        throw new Error('ENOENT');
      });

      await loadDotEnv('/project');

      expect(process.env.OPENAI_API_KEY).toBe('dotenv-key');
      expect(process.env.OTHER_VAR).toBe('value');
    });

    it('should not override existing env vars', async () => {
      process.env.OPENAI_API_KEY = 'existing-key';
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('.env')) {
          return 'OPENAI_API_KEY=new-key';
        }
        throw new Error('ENOENT');
      });

      await loadDotEnv('/project');

      expect(process.env.OPENAI_API_KEY).toBe('existing-key');
    });

    it('should handle quoted values', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('.env')) {
          return 'VAR1="quoted value"\nVAR2=\'single quoted\'';
        }
        throw new Error('ENOENT');
      });

      await loadDotEnv('/project');

      expect(process.env.VAR1).toBe('quoted value');
      expect(process.env.VAR2).toBe('single quoted');
    });

    it('should skip comments and empty lines', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('.env')) {
          return '# comment\n\nVALID_VAR=value';
        }
        throw new Error('ENOENT');
      });

      await loadDotEnv('/project');

      expect(process.env.VALID_VAR).toBe('value');
    });
  });
});

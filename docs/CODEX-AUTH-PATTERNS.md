# Codex Authentication Patterns

This document describes the standardized authentication patterns for OpenAI Codex integration, following the [official Codex CLI patterns](https://github.com/openai/codex).

## Overview

Agent Relay supports multiple authentication methods for Codex/OpenAI, prioritized in this order:

1. **OAuth tokens** - From `~/.codex/auth.json` (recommended - ChatGPT sign-in)
2. **Environment variable** - `OPENAI_API_KEY` (fallback)
3. **Config file API key** - From `~/.codex/auth.json` (legacy)
4. **CLI-based OAuth** - Interactive `codex login` flow

## OAuth Authentication (Recommended)

The recommended method is to use the ChatGPT sign-in flow via the Codex CLI:

```bash
codex login
```

This uses OAuth device flow with PKCE for secure authentication and stores tokens in `~/.codex/auth.json`.

### Why OAuth over API Keys?

- **Recommended by Codex**: The official Codex CLI defaults to ChatGPT sign-in
- **Token refresh**: OAuth tokens can be refreshed automatically
- **No secrets to manage**: No need to handle API key rotation
- **Consistent experience**: Same authentication as the Codex CLI

## Environment Variable Authentication (Fallback)

For users who prefer API keys, you can set the `OPENAI_API_KEY` environment variable:

```bash
# In your shell
export OPENAI_API_KEY="sk-your-api-key-here"

# Or in a .env file (project root)
OPENAI_API_KEY=sk-your-api-key-here
```

**Note**: OAuth tokens take priority over API keys when both are present.

## Configuration Files

### Auth File: `~/.codex/auth.json`

Contains OAuth tokens or API keys:

```json
{
  "tokens": {
    "access_token": "oauth-access-token",
    "refresh_token": "oauth-refresh-token",
    "expires_at": 1704067200000
  }
}
```

Or legacy API key format:

```json
{
  "OPENAI_API_KEY": "sk-your-api-key"
}
```

### Config File: `~/.codex/config.yaml` or `~/.codex/config.json`

For customizing model, approval mode, and providers:

```yaml
# ~/.codex/config.yaml
model: o4-mini
approvalMode: suggest
notify: true

# Custom providers (optional)
providers:
  custom-openai:
    name: Custom OpenAI
    baseURL: https://custom.openai.example.com/v1
    envKey: CUSTOM_OPENAI_KEY
```

## Multi-Provider Support

The module supports all Codex-compatible providers:

| Provider | Environment Variable | Base URL |
|----------|---------------------|----------|
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | (user configured) |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |
| Gemini | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Ollama | `OLLAMA_API_KEY` | `http://localhost:11434/v1` |
| Mistral | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` |
| DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` |
| xAI | `XAI_API_KEY` | `https://api.x.ai/v1` |
| Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| ArceeAI | `ARCEE_API_KEY` | `https://conductor.arcee.ai/v1` |

## Usage in Code

### Check Authentication

```typescript
import { getCodexAuth, getCodexOAuth, isCodexAuthenticated } from './shared/codex-auth.js';

// Quick check
if (await isCodexAuthenticated()) {
  console.log('Codex is authenticated');
}

// Detailed info (OAuth-first, with API key fallback)
const auth = await getCodexAuth();
if (auth.authenticated) {
  console.log(`Auth method: ${auth.method}`); // 'oauth', 'env', or 'config'
  console.log(`Token: ${auth.accessToken || auth.apiKey}`);
  console.log(`Provider: ${auth.provider}`);
  console.log(`Base URL: ${auth.baseURL}`);
}

// OAuth-only mode (no API key fallback)
const oauthAuth = await getCodexOAuth();
if (oauthAuth.authenticated) {
  console.log('Using OAuth tokens');
}
```

### Get Token for API Calls

```typescript
import { getCodexToken } from './shared/codex-auth.js';

const token = await getCodexToken();
if (token) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
}
```

### Check Specific Provider

```typescript
import { getProviderAuth } from './shared/codex-auth.js';

const groqAuth = await getProviderAuth('groq');
if (groqAuth.authenticated) {
  // Use groqAuth.apiKey with groqAuth.baseURL
}
```

### List All Provider Statuses

```typescript
import { getProviderStatuses } from './shared/codex-auth.js';

const statuses = await getProviderStatuses();
for (const provider of statuses) {
  console.log(`${provider.name}: ${provider.authenticated ? 'connected' : 'not connected'}`);
}
```

## OAuth Device Flow

The Codex CLI uses OAuth device flow with PKCE for secure authentication. This is the recommended approach.

### OAuth Endpoints

```typescript
import { CODEX_OAUTH } from './shared/codex-auth.js';

// Available OAuth endpoints:
CODEX_OAUTH.authBaseUrl        // 'https://auth.openai.com'
CODEX_OAUTH.deviceCodeEndpoint // '/deviceauth/usercode'
CODEX_OAUTH.tokenEndpoint      // '/deviceauth/token'
CODEX_OAUTH.callbackEndpoint   // '/deviceauth/callback'
CODEX_OAUTH.pollingTimeoutMs   // 15 minutes
CODEX_OAUTH.pollingIntervalMs  // 5 seconds
```

### How Device Flow Works

1. CLI requests a device code from `/deviceauth/usercode`
2. User visits the verification URL and enters the code
3. CLI polls `/deviceauth/token` until authorization completes
4. On success, tokens are exchanged and stored in `~/.codex/auth.json`

### CLI Authentication Flow

When no existing authentication is found, the relay supports the interactive `codex login` OAuth flow:

1. User initiates auth via dashboard or API
2. Relay spawns `codex login` in a PTY
3. OAuth URL is extracted and displayed to user
4. User completes OAuth in browser
5. Codex CLI receives callback and stores tokens in `~/.codex/auth.json`
6. Relay detects success and marks provider as authenticated

### Device Flow for Headless Environments

For container/headless environments, use device auth:

```bash
codex login --device-auth
```

The relay automatically uses device flow when running in environments without a browser.

## Security Considerations

1. **Never commit API keys** - Use environment variables or `.env` files (add `.env` to `.gitignore`)
2. **Token expiration** - OAuth tokens have expiration times; the module handles refresh automatically
3. **Session limits** - Some providers limit concurrent OAuth sessions; authenticating in one place may revoke another

## Validation

Validate an API key before use:

```typescript
import { validateApiKey } from './shared/codex-auth.js';

const result = await validateApiKey('sk-your-key');
if (result.valid) {
  console.log('API key is valid');
} else {
  console.error(`Invalid: ${result.error}`);
}
```

## Related Files

- `src/shared/codex-auth.ts` - Main authentication module
- `src/daemon/cli-auth.ts` - PTY-based CLI authentication
- `src/shared/cli-auth-config.ts` - CLI command configurations
- `src/cloud/api/providers.ts` - Provider API endpoints

## References

- [OpenAI Codex CLI](https://github.com/openai/codex)
- [OpenAI API Authentication](https://platform.openai.com/docs/api-reference/authentication)

# E2B Sandbox Integration

## Overview

[E2B](https://e2b.dev) provides secure, isolated cloud sandboxes for running AI-generated code. This document outlines how we can leverage E2B to improve agent execution in Agent Relay.

## Current Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Cloud Service                     │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │  Webhooks   │───▶│   Spawner   │                 │
│  └─────────────┘    └──────┬──────┘                 │
└────────────────────────────┼────────────────────────┘
                             │ spawn command
                             ▼
┌─────────────────────────────────────────────────────┐
│              Docker Workspace Container              │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │   Daemon    │───▶│   Agent     │                 │
│  └─────────────┘    └─────────────┘                 │
│  - Node.js, Python, Git, gh                         │
│  - AI CLIs (Claude, Codex, Gemini, etc.)           │
└─────────────────────────────────────────────────────┘
```

**Pain Points:**
- Container startup time (~5-10s)
- Infrastructure management overhead
- Scaling requires container orchestration (K8s, ECS, etc.)
- No easy pause/resume for long-running agents

## Proposed Architecture with E2B

```
┌─────────────────────────────────────────────────────┐
│                    Cloud Service                     │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │  Webhooks   │───▶│   Spawner   │                 │
│  └─────────────┘    └──────┬──────┘                 │
└────────────────────────────┼────────────────────────┘
                             │ E2B SDK
                             ▼
┌─────────────────────────────────────────────────────┐
│                  E2B Cloud (Managed)                 │
│  ┌─────────────────────────────────────────────┐   │
│  │         Custom Sandbox Template              │   │
│  │  - relay-workspace-v1                        │   │
│  │  - Pre-installed: Node, Python, Git, gh     │   │
│  │  - Pre-installed: Claude, Codex, Gemini     │   │
│  │  - ~150ms startup                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Sandbox  │ │ Sandbox  │ │ Sandbox  │  ...      │
│  │ Agent 1  │ │ Agent 2  │ │ Agent 3  │           │
│  └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────┘
```

## Benefits

| Aspect | Docker (Current) | E2B (Proposed) |
|--------|------------------|----------------|
| Startup time | ~5-10s | ~150ms |
| Infrastructure | Self-managed | Managed |
| Scaling | Manual/K8s | Automatic |
| Isolation | Container | Microvm |
| Pause/Resume | Not supported | Native |
| Cost model | Always-on | Pay per use |

## Implementation Plan

### Phase 1: E2B SDK Integration

Add E2B SDK and create basic sandbox spawning:

```typescript
// src/cloud/services/e2b-sandbox.ts
import { Sandbox } from '@e2b/sdk';

export interface SandboxConfig {
  template: string;
  timeout?: number;
  envVars?: Record<string, string>;
}

export async function createAgentSandbox(config: SandboxConfig): Promise<Sandbox> {
  const sandbox = await Sandbox.create(config.template, {
    timeoutMs: config.timeout || 60000,
    envVars: config.envVars,
  });

  return sandbox;
}

export async function runAgentInSandbox(
  sandbox: Sandbox,
  agentType: string,
  prompt: string
): Promise<{ output: string; exitCode: number }> {
  // Clone repo if needed
  await sandbox.commands.run('git clone $REPO_URL /workspace/repo');

  // Run the agent
  const result = await sandbox.commands.run(
    `claude --agent ${agentType} --prompt "${prompt}"`,
    { cwd: '/workspace/repo' }
  );

  return {
    output: result.stdout + result.stderr,
    exitCode: result.exitCode,
  };
}
```

### Phase 2: Custom Sandbox Template

Create a custom E2B template matching our workspace:

```dockerfile
# e2b/templates/relay-workspace/Dockerfile
FROM e2b/base:latest

# Install system dependencies
RUN apt-get update && apt-get install -y \
    bash ca-certificates curl git python3 jq

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh

# Install AI CLIs
RUN npm install -g @openai/codex @google/gemini-cli opencode-ai@latest
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN curl -fsSL https://app.factory.ai/cli | sh

ENV PATH="/root/.local/bin:$PATH"
```

```yaml
# e2b/templates/relay-workspace/e2b.toml
[template]
name = "relay-workspace"
dockerfile = "Dockerfile"

[template.resources]
cpu = 2
memory = 4096
```

### Phase 3: Spawner Integration

Update spawners to use E2B:

```typescript
// src/cloud/services/ci-agent-spawner.ts
import { createAgentSandbox, runAgentInSandbox } from './e2b-sandbox.js';

export async function spawnCIFixAgent(event: CIFailureEvent): Promise<void> {
  // Create sandbox
  const sandbox = await createAgentSandbox({
    template: 'relay-workspace',
    timeout: 300000, // 5 minutes
    envVars: {
      REPO_URL: event.repository,
      GITHUB_TOKEN: await getRepoToken(event.repositoryId),
      CI_RUN_ID: event.checkRunId,
    },
  });

  try {
    // Run CI fix agent
    const result = await runAgentInSandbox(
      sandbox,
      'ci-fix',
      `Fix CI failure in ${event.checkName}: ${event.conclusion}`
    );

    // Post results back to GitHub
    await postCIFixComment(event, result);
  } finally {
    // Always clean up
    await sandbox.close();
  }
}
```

### Phase 4: Hybrid Mode

Support both Docker (self-hosted) and E2B (cloud) execution:

```typescript
// src/cloud/services/agent-executor.ts
export type ExecutionBackend = 'docker' | 'e2b';

export interface ExecutorConfig {
  backend: ExecutionBackend;
  e2bApiKey?: string;
  dockerSocket?: string;
}

export async function executeAgent(
  config: ExecutorConfig,
  agentType: string,
  prompt: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  switch (config.backend) {
    case 'e2b':
      return executeInE2B(agentType, prompt, context);
    case 'docker':
      return executeInDocker(agentType, prompt, context);
  }
}
```

## Configuration

Add E2B configuration to workspace settings:

```typescript
// Workspace settings
interface WorkspaceSettings {
  execution: {
    backend: 'docker' | 'e2b' | 'hybrid';
    e2b?: {
      apiKey: string;
      template: string;
      defaultTimeout: number;
    };
    docker?: {
      image: string;
      socket: string;
    };
  };
}
```

## Cost Considerations

E2B pricing is based on sandbox-seconds. Estimated costs:

| Scenario | Docker (self-hosted) | E2B |
|----------|---------------------|-----|
| CI fix agent (5 min) | ~$0.01 compute | ~$0.05 |
| Code review (2 min) | ~$0.004 | ~$0.02 |
| Long task (30 min) | ~$0.06 | ~$0.30 |

**Recommendation:** Use E2B for:
- Short-lived tasks (CI fixes, code review)
- Burst workloads (many concurrent agents)
- Teams without container infrastructure

Use Docker for:
- Long-running agents
- High-volume workloads
- Self-hosted/air-gapped environments

## Security

E2B sandboxes provide:
- **Microvm isolation** - stronger than containers
- **Network isolation** - configurable internet access
- **Ephemeral by default** - no persistent state unless explicit
- **No host access** - sandboxes can't reach host systems

## Migration Path

1. **Week 1**: Add E2B SDK, create basic integration
2. **Week 2**: Build custom template, test with CI agents
3. **Week 3**: Add hybrid mode, workspace configuration
4. **Week 4**: Documentation, monitoring, rollout

## Open Questions

1. **Template caching**: How often do we need to rebuild templates?
2. **Secrets management**: How to inject API keys securely?
3. **Artifact persistence**: How to preserve agent outputs?
4. **Monitoring**: How to track sandbox usage and costs?

## Advanced Capabilities

### E2B Desktop - Full GUI/Browser Control

[E2B Desktop](https://github.com/e2b-dev/desktop) provides complete Linux desktop environments:

**Features:**
- Xfce4 desktop environment
- Pre-installed Chrome, Firefox, VS Code
- VNC streaming for real-time viewing
- Mouse/keyboard control via xdotool
- Screenshot capture for visual AI

```typescript
// src/cloud/services/e2b-desktop.ts
import { Desktop } from '@e2b/desktop';

export async function runBrowserTest(
  testScript: string,
  url: string
): Promise<{ screenshots: string[]; result: string }> {
  const desktop = await Desktop.create();

  try {
    // Open browser
    await desktop.launch('google-chrome', [url]);
    await desktop.wait(2000);

    // Take screenshot
    const screenshot = await desktop.screenshot();

    // Run test script with Playwright
    const result = await desktop.commands.run(`npx playwright test ${testScript}`);

    return {
      screenshots: [screenshot],
      result: result.stdout,
    };
  } finally {
    await desktop.close();
  }
}
```

**Use cases:**
- Visual regression testing
- E2E browser tests
- GUI automation
- Screen recording for demos

### Browserbase Integration - Serverless Browsers

[Browserbase](https://browserbase.com) provides dedicated serverless browser infrastructure:

**Features:**
- Spin up 1000s of browsers in milliseconds
- Native Playwright/Puppeteer/Selenium support
- Built-in captcha solving
- Residential proxies
- Session recording & debugging
- SOC-2 & HIPAA compliant

```typescript
// src/cloud/services/browserbase.ts
import { chromium } from 'playwright';

export async function runWithBrowserbase(
  script: (page: Page) => Promise<void>
): Promise<void> {
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`
  );

  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await script(page);
  } finally {
    await browser.close();
  }
}
```

**Use cases:**
- Web scraping agents
- Form automation
- Testing production sites
- Multi-browser testing

### Docker MCP Catalog - 200+ Tools

E2B sandboxes now include access to [Docker's MCP Catalog](https://www.docker.com/blog/docker-e2b-building-the-future-of-trusted-ai/):

**Available tools include:**
- GitHub, GitLab
- Perplexity, Browserbase
- ElevenLabs, Stripe
- Slack, Discord
- And 200+ more

```typescript
// Agents can use MCP tools within sandboxes
const sandbox = await Sandbox.create('relay-workspace-mcp');
await sandbox.commands.run(`
  # Use GitHub MCP tool
  mcp-github create-issue --repo user/repo --title "Bug fix"
`);
```

### Hybrid Architecture for Advanced Agents

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Relay Cloud                            │
│  ┌─────────────┐                                                │
│  │   Spawner   │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ├──────────────────┬──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ E2B Sandbox │    │ E2B Desktop │    │ Browserbase │         │
│  │ (Code exec) │    │ (GUI/VNC)   │    │ (Browsers)  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                 │
│         └──────────────────┴──────────────────┘                 │
│                            │                                    │
│                   MCP Tool Gateway                              │
│              (200+ integrations)                                │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Capabilities Matrix

| Capability | E2B Sandbox | E2B Desktop | Browserbase |
|------------|-------------|-------------|-------------|
| Code execution | ✅ | ✅ | ❌ |
| Terminal/CLI | ✅ | ✅ | ❌ |
| File system | ✅ | ✅ | Limited |
| GUI apps | ❌ | ✅ | ❌ |
| Browser control | Limited | ✅ | ✅ |
| Visual testing | ❌ | ✅ | ✅ |
| Parallel scale | Good | Limited | Excellent |
| Cost | Low | Medium | Medium |

### Workspace Configuration

```typescript
interface WorkspaceExecutionConfig {
  // Default execution backend
  default: 'e2b' | 'e2b-desktop' | 'docker';

  // E2B configuration
  e2b?: {
    apiKey: string;
    template: string;
    timeout: number;
    enableMcp: boolean;
  };

  // E2B Desktop for GUI tasks
  e2bDesktop?: {
    apiKey: string;
    resolution: { width: number; height: number };
    vncEnabled: boolean;
  };

  // Browserbase for web automation
  browserbase?: {
    apiKey: string;
    proxy?: 'residential' | 'datacenter';
    captchaSolver: boolean;
  };

  // Agent-specific overrides
  agentOverrides?: {
    [agentType: string]: {
      backend: 'e2b' | 'e2b-desktop' | 'browserbase' | 'docker';
      capabilities?: string[];
    };
  };
}

// Example configuration
const config: WorkspaceExecutionConfig = {
  default: 'e2b',
  e2b: {
    apiKey: process.env.E2B_API_KEY!,
    template: 'relay-workspace',
    timeout: 300000,
    enableMcp: true,
  },
  e2bDesktop: {
    apiKey: process.env.E2B_API_KEY!,
    resolution: { width: 1920, height: 1080 },
    vncEnabled: true,
  },
  browserbase: {
    apiKey: process.env.BROWSERBASE_API_KEY!,
    captchaSolver: true,
  },
  agentOverrides: {
    'visual-tester': { backend: 'e2b-desktop' },
    'web-scraper': { backend: 'browserbase' },
    'ci-fix': { backend: 'e2b' },
  },
};
```

## References

- [E2B Documentation](https://e2b.dev/docs)
- [E2B GitHub](https://github.com/e2b-dev/E2B)
- [E2B Desktop](https://github.com/e2b-dev/desktop)
- [Custom Templates Guide](https://e2b.dev/docs/sandbox-template)
- [Docker + E2B Partnership](https://www.docker.com/blog/docker-e2b-building-the-future-of-trusted-ai/)
- [Browserbase](https://browserbase.com)
- [How Manus Uses E2B](https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers)

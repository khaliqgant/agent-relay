/**
 * Workspace Tools MCP Server
 *
 * Exposes browser testing and container spawning capabilities to agents via MCP.
 * Agents can discover and call these tools through the standard MCP protocol.
 *
 * Tools provided:
 * - browser_screenshot: Capture screenshot of current display or URL
 * - browser_navigate: Open URL in browser
 * - browser_test: Run Playwright test
 * - container_run: Run command in isolated container
 * - container_exec: Execute in running container
 * - workspace_capabilities: List available capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  isBrowserTestingAvailable,
  takeDisplayScreenshot,
  runPlaywrightScript,
  launchBrowser,
  getVNCInfo,
} from '../services/browser-testing.js';

import {
  isDockerAvailable,
  runInContainer,
  runCode,
  listContainers,
  PRESET_CONTAINERS,
} from '../services/container-spawner.js';

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
  {
    name: 'workspace_capabilities',
    description:
      'List all available workspace capabilities (browser testing, container spawning, etc.). Call this first to understand what tools are available.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'browser_screenshot',
    description:
      'Capture a screenshot. Can capture the current display or navigate to a URL first. Returns the path to the saved screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Optional URL to navigate to before taking screenshot',
        },
        outputPath: {
          type: 'string',
          description: 'Optional path to save screenshot (default: /tmp/screenshot-{timestamp}.png)',
        },
        fullPage: {
          type: 'boolean',
          description: 'Capture full page (for web pages)',
        },
      },
      required: [],
    },
  },
  {
    name: 'browser_navigate',
    description:
      'Open a URL in the browser. The browser window is visible via VNC if enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to',
        },
        browser: {
          type: 'string',
          enum: ['chromium', 'firefox'],
          description: 'Browser to use (default: chromium)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_script',
    description:
      'Run a Playwright script for browser automation. The script has access to `page` object.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description:
            'Playwright script to execute. Has access to `page` object. Example: await page.goto("https://example.com"); await page.screenshot({path: "test.png"});',
        },
        browser: {
          type: 'string',
          enum: ['chromium', 'firefox', 'webkit'],
          description: 'Browser to use (default: chromium)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'container_run',
    description:
      'Run a command in an isolated Docker container. Useful for running untrusted code, testing in different environments, or using language-specific toolchains.',
    inputSchema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description:
            'Docker image to use. Examples: node:20, python:3.11, ubuntu:22.04, golang:1.21',
        },
        command: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command to run as array. Example: ["python", "-c", "print(1+1)"]',
        },
        workdir: {
          type: 'string',
          description: 'Working directory inside container (default: /workspace)',
        },
        volumes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Volumes to mount in host:container format',
        },
        env: {
          type: 'object',
          description: 'Environment variables',
        },
        memory: {
          type: 'string',
          description: 'Memory limit (e.g., "512m", "2g")',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
        },
      },
      required: ['image', 'command'],
    },
  },
  {
    name: 'container_run_code',
    description:
      'Quick helper to run code in a language-specific container. Automatically selects the right image and command.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['node', 'python', 'go', 'rust', 'bash'],
          description: 'Programming language',
        },
        code: {
          type: 'string',
          description: 'Code to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
        },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'container_list',
    description: 'List running Docker containers',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'vnc_info',
    description: 'Get VNC connection info for viewing the browser/display',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'workspace_capabilities': {
      const capabilities = {
        browserTesting: {
          available: isBrowserTestingAvailable(),
          features: isBrowserTestingAvailable()
            ? ['screenshot', 'navigation', 'playwright', 'vnc']
            : [],
          vnc: getVNCInfo(),
        },
        containerSpawning: {
          available: isDockerAvailable(),
          presets: isDockerAvailable() ? Object.keys(PRESET_CONTAINERS) : [],
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(capabilities, null, 2) }],
      };
    }

    case 'browser_screenshot': {
      if (!isBrowserTestingAvailable()) {
        return {
          content: [
            {
              type: 'text',
              text: 'Browser testing not available. Workspace may not have Xvfb/display configured.',
            },
          ],
        };
      }

      const url = args.url as string | undefined;
      const outputPath = args.outputPath as string | undefined;

      // If URL provided, navigate first using Playwright
      if (url) {
        const result = await runPlaywrightScript(
          `
          await page.goto('${url}');
          await page.waitForLoadState('networkidle');
          await page.screenshot({ path: '${outputPath || '/tmp/screenshot.png'}', fullPage: ${args.fullPage || false} });
          `,
          { timeout: 30000 }
        );
        return {
          content: [
            {
              type: 'text',
              text: result.success
                ? `Screenshot saved to ${outputPath || '/tmp/screenshot.png'}`
                : `Failed: ${result.output}`,
            },
          ],
        };
      }

      // Otherwise just capture current display
      const path = await takeDisplayScreenshot({ outputPath });
      return {
        content: [{ type: 'text', text: `Screenshot saved to ${path}` }],
      };
    }

    case 'browser_navigate': {
      if (!isBrowserTestingAvailable()) {
        return {
          content: [{ type: 'text', text: 'Browser testing not available.' }],
        };
      }

      const url = args.url as string;
      const browser = (args.browser as 'chromium' | 'firefox') || 'chromium';
      const result = await launchBrowser(url, { browser });

      return {
        content: [
          {
            type: 'text',
            text: `Browser launched (PID: ${result.pid}). View via VNC: ${getVNCInfo().noVncUrl || 'not available'}`,
          },
        ],
      };
    }

    case 'browser_script': {
      if (!isBrowserTestingAvailable()) {
        return {
          content: [{ type: 'text', text: 'Browser testing not available.' }],
        };
      }

      const script = args.script as string;
      const browser = args.browser as 'chromium' | 'firefox' | 'webkit' | undefined;
      const timeout = args.timeout as number | undefined;

      const result = await runPlaywrightScript(script, { browser, timeout });

      return {
        content: [
          {
            type: 'text',
            text: result.success
              ? `Script executed successfully.\n\nOutput:\n${result.output}`
              : `Script failed.\n\nOutput:\n${result.output}`,
          },
        ],
      };
    }

    case 'container_run': {
      if (!isDockerAvailable()) {
        return {
          content: [
            {
              type: 'text',
              text: 'Docker not available. Mount /var/run/docker.sock to enable container spawning.',
            },
          ],
        };
      }

      const result = await runInContainer({
        image: args.image as string,
        command: args.command as string[],
        workdir: args.workdir as string | undefined,
        volumes: args.volumes as string[] | undefined,
        env: args.env as Record<string, string> | undefined,
        memory: args.memory as string | undefined,
        timeout: args.timeout as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Exit code: ${result.exitCode}\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
          },
        ],
      };
    }

    case 'container_run_code': {
      if (!isDockerAvailable()) {
        return {
          content: [{ type: 'text', text: 'Docker not available.' }],
        };
      }

      const language = args.language as 'node' | 'python' | 'go' | 'rust' | 'bash';
      const code = args.code as string;
      const timeout = args.timeout as number | undefined;

      const result = await runCode(language, code, { timeout });

      return {
        content: [
          {
            type: 'text',
            text: `Exit code: ${result.exitCode}\n\nOutput:\n${result.stdout}${result.stderr}`,
          },
        ],
      };
    }

    case 'container_list': {
      if (!isDockerAvailable()) {
        return {
          content: [{ type: 'text', text: 'Docker not available.' }],
        };
      }

      const containers = listContainers();
      return {
        content: [
          {
            type: 'text',
            text:
              containers.length > 0
                ? containers.map((c) => `${c.name} (${c.image}): ${c.status}`).join('\n')
                : 'No running containers',
          },
        ],
      };
    }

    case 'vnc_info': {
      const info = getVNCInfo();
      return {
        content: [
          {
            type: 'text',
            text: info.available
              ? `VNC available:\n- Web interface: ${info.noVncUrl}\n- Native: ${info.vncUrl}`
              : 'VNC not available in this workspace',
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
  }
}

// ============================================================================
// Server Setup
// ============================================================================

export async function startWorkspaceToolsServer(): Promise<void> {
  const server = new Server(
    {
      name: 'workspace-tools',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Filter tools based on what's actually available
    const availableTools = TOOLS.filter((tool) => {
      if (tool.name.startsWith('browser_') && !isBrowserTestingAvailable()) {
        return false;
      }
      if (tool.name.startsWith('container_') && !isDockerAvailable()) {
        return false;
      }
      return true;
    });

    return { tools: availableTools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, (args as Record<string, unknown>) || {});
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[workspace-tools] MCP server started');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkspaceToolsServer().catch(console.error);
}

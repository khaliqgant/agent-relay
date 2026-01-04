---
paths:
  - "**/*"
---

# Workspace Capabilities

This workspace has additional tools available via MCP. Check what's available before attempting advanced operations.

## Available MCP Tools

### Discovery
- `workspace_capabilities` - **Call this first** to see what's available

### Browser Testing (if enabled)
- `browser_screenshot` - Capture screenshots (display or URL)
- `browser_navigate` - Open URL in browser
- `browser_script` - Run Playwright automation scripts
- `vnc_info` - Get VNC URL to watch browser

### Container Spawning (if Docker socket mounted)
- `container_run` - Run command in isolated container
- `container_run_code` - Quick code execution (node/python/go/rust/bash)
- `container_list` - List running containers

## When to Use These Tools

**Use browser testing for:**
- Visual verification of UI changes
- E2E testing with real browsers
- Screenshot documentation
- Debugging frontend issues

**Use container spawning for:**
- Running untrusted or risky code safely
- Testing in different environments (Node versions, etc.)
- Parallel isolated task execution
- Language-specific toolchains

## Example: Verify UI Change

```typescript
// After making frontend changes, verify visually
const result = await mcp.browser_script({
  script: `
    await page.goto('http://localhost:3000');
    await page.screenshot({ path: '/tmp/ui-check.png' });
  `
});
```

## Example: Test Code Safely

```typescript
// Run potentially dangerous code in isolation
const result = await mcp.container_run({
  image: 'python:3.11',
  command: ['python', '-c', userCode],
  memory: '256m',
  timeout: 10000
});
```

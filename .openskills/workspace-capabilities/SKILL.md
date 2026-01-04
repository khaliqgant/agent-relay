# Workspace Capabilities

This workspace has advanced capabilities for browser testing and container management.

## Quick Reference

### Check What's Available

```typescript
// Call the workspace_capabilities tool first
const caps = await mcp.workspace_capabilities();
console.log(caps);
// {
//   browserTesting: { available: true, features: ['screenshot', 'navigation', 'playwright', 'vnc'] },
//   containerSpawning: { available: true, presets: ['node20', 'python311', 'go121', ...] }
// }
```

## Browser Testing

### Take Screenshots

```typescript
// Screenshot current display
await mcp.browser_screenshot();

// Screenshot a URL
await mcp.browser_screenshot({ url: 'https://example.com', fullPage: true });
```

### Browser Automation with Playwright

```typescript
// Run Playwright script
await mcp.browser_script({
  script: `
    await page.goto('https://example.com');
    await page.click('button#submit');
    await page.screenshot({ path: '/tmp/result.png' });
  `
});
```

### Open Browser for Visual Inspection

```typescript
// Launch browser (visible via VNC)
await mcp.browser_navigate({ url: 'https://example.com' });

// Get VNC URL to watch
const vnc = await mcp.vnc_info();
console.log(vnc.noVncUrl); // http://localhost:6080/vnc.html
```

## Container Spawning

### Run Code in Isolated Containers

```typescript
// Quick: Run Python code
await mcp.container_run_code({
  language: 'python',
  code: 'print(2 + 2)'
});

// Quick: Run Node.js code
await mcp.container_run_code({
  language: 'node',
  code: 'console.log(Date.now())'
});
```

### Run Custom Container Commands

```typescript
// Run in specific image
await mcp.container_run({
  image: 'python:3.11',
  command: ['python', '-c', 'import sys; print(sys.version)']
});

// With resource limits
await mcp.container_run({
  image: 'node:20',
  command: ['npm', 'test'],
  workdir: '/workspace',
  volumes: ['./:/workspace'],
  memory: '1g',
  timeout: 60000
});
```

### Available Language Presets

| Language | Image | Usage |
|----------|-------|-------|
| `node` | node:20-slim | JavaScript/TypeScript |
| `python` | python:3.11-slim | Python |
| `go` | golang:1.21-alpine | Go |
| `rust` | rust:slim | Rust |
| `bash` | ubuntu:22.04 | Shell scripts |

## Common Patterns

### Visual Regression Testing

```typescript
// Take baseline screenshot
await mcp.browser_screenshot({
  url: 'http://localhost:3000',
  outputPath: '/tmp/baseline.png'
});

// Make changes...

// Take comparison screenshot
await mcp.browser_screenshot({
  url: 'http://localhost:3000',
  outputPath: '/tmp/current.png'
});

// Compare with ImageMagick
await mcp.container_run({
  image: 'dpokidov/imagemagick',
  command: ['compare', '-metric', 'RMSE', '/tmp/baseline.png', '/tmp/current.png', '/tmp/diff.png'],
  volumes: ['/tmp:/tmp']
});
```

### E2E Test in Container

```typescript
// Run Playwright tests in isolated container
await mcp.container_run({
  image: 'mcr.microsoft.com/playwright:latest',
  command: ['npx', 'playwright', 'test'],
  workdir: '/workspace',
  volumes: ['./:/workspace'],
  env: { CI: 'true' }
});
```

### Multi-Environment Testing

```typescript
// Test against multiple Node versions
for (const version of ['18', '20', '22']) {
  const result = await mcp.container_run({
    image: `node:${version}`,
    command: ['node', '--version']
  });
  console.log(`Node ${version}: ${result.stdout}`);
}
```

## VNC Viewing

When browser testing is enabled, you can watch agent browser interactions:

1. **Web interface**: Open `http://localhost:6080/vnc.html`
2. **Native VNC client**: Connect to `vnc://localhost:5900`

The VNC URL is returned by `vnc_info` tool.

## Troubleshooting

### Browser testing not available

The workspace needs Xvfb virtual display. Use the browser-enabled Dockerfile:

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.browser.yml up
```

### Container spawning not available

Docker socket must be mounted:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### Screenshots are blank

Wait for page load:

```typescript
await mcp.browser_script({
  script: `
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/screenshot.png' });
  `
});
```

# Workspace Capabilities - Agent Discovery

How should agents discover and use workspace capabilities (browser testing, container spawning, etc.)?

## Problem Statement

We have workspace capabilities:
- Browser testing (Playwright, Xvfb, VNC)
- Container spawning (Docker socket)
- Potentially more in the future (E2B, Browserbase)

**Challenge:** How do agents know these exist without bloating context for every agent?

Current implementations exist but are not wired up:
- `src/daemon/services/browser-testing.ts`
- `src/daemon/services/container-spawner.ts`
- `deploy/workspace/Dockerfile.browser`

## Key Questions

### 1. Static vs Dynamic Discovery
- [ ] Should capabilities be in rules/skills (static, always injected)?
- [ ] Should capabilities be discovered via MCP at runtime (dynamic)?
- [ ] Hybrid: minimal hint in rules, full discovery via MCP?

### 2. Cloud vs Local
- [ ] Cloud workspaces: How are capabilities configured per workspace?
- [ ] Local daemons: How does the daemon know what's available?
- [ ] Should there be a "capability manifest" per workspace?

### 3. Context Budget
- [ ] How much context is acceptable for capability hints?
- [ ] Should agents ask for capabilities only when needed?
- [ ] Can we use tool descriptions instead of injected prompts?

### 4. Opt-in vs Opt-out
- [ ] Should capabilities be enabled by default?
- [ ] Per-workspace configuration?
- [ ] Per-agent configuration?

## Design Options

### Option A: MCP-Only Discovery
Agents call `workspace_capabilities` tool to discover what's available.
No static context injection.

**Pros:** Zero context overhead, dynamic
**Cons:** Agents might not know to call it

### Option B: Minimal Hint + MCP
One line in system prompt: "Call workspace_capabilities to check for browser/container tools"

**Pros:** Tiny context, agents know to look
**Cons:** Still some static injection

### Option C: Workspace Manifest
Each workspace has a capabilities.json that configures what's available.
Cloud provisions this, agents read at startup.

**Pros:** Explicit configuration
**Cons:** More infrastructure

### Option D: Auto-Detection
MCP server auto-detects capabilities (checks DISPLAY, docker.sock) and only exposes available tools.

**Pros:** Zero configuration, just works
**Cons:** Magic behavior

## Tasks

### capability-discovery-design
- [ ] Decide on discovery mechanism
- [ ] Document decision rationale
- [ ] Create ADR (Architecture Decision Record)

Dependencies: none
Priority: high

### capability-manifest-schema
- [ ] Define WorkspaceCapabilities schema
- [ ] Define how cloud provisions capabilities
- [ ] Define how daemon reads capabilities

Dependencies: capability-discovery-design
Priority: medium

### mcp-capability-tools
- [ ] Create MCP server for workspace tools
- [ ] Only expose tools for available capabilities
- [ ] Add workspace_capabilities discovery tool

Dependencies: capability-manifest-schema
Priority: medium

### agent-prompting-strategy
- [ ] Determine minimal context for capability awareness
- [ ] Test with real agents
- [ ] Measure context overhead

Dependencies: capability-discovery-design
Priority: medium

### cloud-workspace-config
- [ ] Add capabilities to workspace provisioning
- [ ] UI for enabling/disabling capabilities
- [ ] Per-workspace capability billing (if applicable)

Dependencies: capability-manifest-schema
Priority: low

## Notes

The core services are already implemented:
- Browser testing: `src/daemon/services/browser-testing.ts`
- Container spawning: `src/daemon/services/container-spawner.ts`
- Browser Dockerfile: `deploy/workspace/Dockerfile.browser`

What's missing is the discovery/awareness layer that doesn't bloat context.

See also:
- `docs/design/e2b-sandbox-integration.md` - E2B as alternative backend

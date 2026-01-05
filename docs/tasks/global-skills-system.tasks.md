# Agent Relay Skills via PRPM

Leverage PRPM (Prompt Package Manager) to distribute agent-relay skills that users can opt into.

## Overview

PRPM already provides:
- Registry at `registry.prpm.dev`
- `prpm install @org/package` CLI
- Lockfile tracking (`prpm.lock`)
- Format conversion (claude, cursor, agents.md)
- Subtypes: skill, agent, rule, snippet
- Lazy loading (`eager: false`)

**We should publish `@agent-relay/*` packages to PRPM instead of building custom infrastructure.**

## Current State

Already using prpm in this repo (see `prpm.lock`):
- `@agent-relay/agent-relay-snippet` - Relay messaging syntax
- `@agent-relay/agent-relay-protocol` - Full protocol docs
- Various skills from `@prpm/*`, `@anthropic/*`, `@my-senior-dev/*`

## Problem: Global vs Project Skills

PRPM installs to project directories (`.claude/skills/`). We need:
- Skills NOT in project source control
- Skills available across all projects
- Per-user opt-in, not per-project

### Potential Solutions

**A. PRPM Global Flag (feature request)**
```bash
prpm install --global @agent-relay/browser-testing
# Installs to ~/.prpm/skills/ or ~/.config/prpm/skills/
```

**B. User-level prpm.lock**
```
~/.agent-relay/
├── prpm.lock          # User's global skills
└── .claude/skills/    # Installed skill content
```
Agent reads both project and user prpm.lock.

**C. Workspace Bundle**
Cloud workspaces come with @agent-relay skills pre-installed.
Users don't manage - just available in cloud.

## Proposed Skills to Publish

### @agent-relay/workspace-capabilities
Documentation for browser testing + container spawning.

```json
{
  "name": "@agent-relay/workspace-capabilities",
  "version": "1.0.0",
  "description": "Browser testing (Playwright, VNC) and container spawning (Docker) for agent-relay workspaces",
  "format": "claude",
  "subtype": "skill",
  "eager": false,
  "tags": ["agent-relay", "browser-testing", "docker", "workspace"],
  "files": [".claude/skills/workspace-capabilities/SKILL.md"]
}
```

### @agent-relay/browser-testing
Focused Playwright/screenshot skill.

### @agent-relay/container-spawning
Focused Docker/container skill.

### @agent-relay/linear-integration
Linear webhook/API patterns.

### @agent-relay/slack-integration
Slack bot patterns.

### @agent-relay/workspace-pack (collection)
Bundle of all workspace skills.

```json
{
  "collections": [{
    "id": "workspace-pack",
    "name": "Agent Relay Workspace Pack",
    "description": "All workspace capability skills",
    "packages": [
      { "packageId": "@agent-relay/workspace-capabilities" },
      { "packageId": "@agent-relay/browser-testing" },
      { "packageId": "@agent-relay/container-spawning" }
    ]
  }]
}
```

## Tasks

### prpm-global-research
- [ ] Check if prpm supports `--global` flag
- [ ] If not, evaluate: feature request vs workaround
- [ ] Document findings

Dependencies: none
Priority: high

### user-skills-directory
- [ ] Define `~/.agent-relay/skills/` structure
- [ ] Implement reading from user directory in daemon
- [ ] Merge user + project skills in agent manifest

Dependencies: prpm-global-research
Priority: high

### publish-workspace-capabilities
- [ ] Create skill content (SKILL.md)
- [ ] Create prpm.json manifest
- [ ] Test locally with `prpm install .`
- [ ] Publish to registry.prpm.dev

Dependencies: none (can do in parallel)
Priority: high

### publish-browser-testing
- [ ] Extract browser-specific content from workspace-capabilities
- [ ] Create focused SKILL.md
- [ ] Publish to registry

Dependencies: publish-workspace-capabilities
Priority: medium

### publish-container-spawning
- [ ] Extract container-specific content
- [ ] Create focused SKILL.md
- [ ] Publish to registry

Dependencies: publish-workspace-capabilities
Priority: medium

### workspace-pack-collection
- [ ] Create collection prpm.json
- [ ] Bundle all workspace skills
- [ ] Publish collection

Dependencies: publish-browser-testing, publish-container-spawning
Priority: low

### cloud-workspace-provisioning
- [ ] Pre-install @agent-relay skills in cloud workspace images
- [ ] Or: fetch on workspace creation
- [ ] Make configurable per-workspace

Dependencies: publish-workspace-capabilities
Priority: medium

## Example Skill Content

```markdown
---
name: workspace-capabilities
description: Browser testing and container spawning for agent-relay workspaces
---

# Workspace Capabilities

This workspace may have additional capabilities available.

## Checking Availability

Before using these features, verify they're available:

\`\`\`typescript
// Check for browser testing
const hasBrowser = process.env.DISPLAY !== undefined;

// Check for container spawning
const hasDocker = existsSync('/var/run/docker.sock');
\`\`\`

## Browser Testing

[Content about Playwright, screenshots, VNC...]

## Container Spawning

[Content about Docker, presets, resource limits...]
```

## User Flow

```bash
# Option A: Global install (if prpm supports it)
prpm install --global @agent-relay/workspace-pack

# Option B: User directory workaround
cd ~/.agent-relay
prpm install @agent-relay/workspace-pack

# Option C: Cloud workspace (automatic)
# Skills pre-installed, just use them
```

## Why PRPM Over Custom

| Custom System | PRPM |
|--------------|------|
| Build registry | ✅ Already exists |
| Build CLI | ✅ Already exists |
| Build lockfile | ✅ Already exists |
| Version management | ✅ Already exists |
| Format conversion | ✅ Already exists |

**PRPM gives us distribution for free. We just publish packages.**

## Open Questions for PRPM

1. **Global installs** - `prpm install --global`?
2. **Multiple lockfile locations** - project + user?
3. **Conditional activation** - `activationCondition` field?

May need to contribute these features or work around them.

## References

- `prpm.lock` - Current installed packages
- `.claude/skills/prpm-json-best-practices-skill/` - How to create packages
- `docs/tasks/workspace-capabilities.tasks.md` - Runtime capability discovery
- Implementation: `src/daemon/services/browser-testing.ts`, `container-spawner.ts`

# Agent Relay Global Skills System

A system for distributing opt-in skills that are installed globally, not in project repos.

## Problem Statement

Skills that bloat project context:
- Workspace capabilities (browser testing, containers)
- Integration guides (Linear, Slack, GitHub)
- Agent patterns (debugging, refactoring, testing)
- Provider-specific knowledge (Claude, Codex, Gemini quirks)

**We don't want these in every project's `.claude/` or `.openskills/`**

## Proposed Architecture

```
~/.agent-relay/
├── skills/                          # Global skills directory
│   ├── workspace-capabilities/
│   │   └── SKILL.md
│   ├── browser-testing/
│   │   └── SKILL.md
│   ├── linear-integration/
│   │   └── SKILL.md
│   └── debugging-patterns/
│       └── SKILL.md
├── skills.json                      # Installed skills manifest
└── config.json                      # User preferences
```

## Key Questions

### 1. Installation & Distribution
- [ ] How are skills installed? (`agent-relay skills install <name>`?)
- [ ] Where do skills come from? (npm, git, registry?)
- [ ] Version management?
- [ ] Updates?

### 2. Discovery by Agents
- [ ] How do agents know global skills exist?
- [ ] Merged with project skills in manifest?
- [ ] Separate namespace? (`@relay/browser-testing` vs `browser-testing`)

### 3. Activation
- [ ] All installed skills available, or per-project activation?
- [ ] `agent-relay.json` in project root to enable specific global skills?
- [ ] Environment variable overrides?

### 4. Context Loading
- [ ] Lazy load (agent requests) vs eager load (always injected)?
- [ ] How to hint at available skills without loading content?
- [ ] Skill metadata (description, size, dependencies)?

### 5. Cloud vs Local
- [ ] Cloud workspaces: skills bundled in workspace image?
- [ ] Cloud workspaces: fetched on demand?
- [ ] User skill preferences synced to cloud?

## Design Options

### Option A: CLI-Managed Global Skills

```bash
# Install a skill
agent-relay skills install @relay/browser-testing

# List installed skills
agent-relay skills list

# Enable for current project
agent-relay skills enable browser-testing

# Skills available via same mechanism as project skills
```

**Pros:** Familiar pattern (npm-like), explicit control
**Cons:** Another thing to manage

### Option B: Skills Registry + Auto-Discovery

Skills published to a registry. Daemon auto-discovers based on workspace capabilities.

```json
// ~/.agent-relay/skills.json
{
  "installed": ["@relay/browser-testing", "@relay/linear"],
  "autoEnable": {
    "browser-testing": { "when": "xvfb-available" },
    "linear": { "when": "linear-token-set" }
  }
}
```

**Pros:** Smart activation, less manual work
**Cons:** Magic, harder to debug

### Option C: Bundled Skill Packs

Curated skill packs installed together:

```bash
agent-relay skills install @relay/workspace-pack  # browser, containers, etc.
agent-relay skills install @relay/integrations-pack  # linear, slack, github
```

**Pros:** Simpler UX, curated combinations
**Cons:** Less granular control

### Option D: Git-Based Skills

Skills are git repos, installed via URL:

```bash
agent-relay skills install https://github.com/agent-relay/skills-browser-testing
```

**Pros:** Easy to create/share custom skills
**Cons:** No central discovery

## Skill Manifest Schema

```typescript
interface GlobalSkill {
  name: string;           // e.g., "@relay/browser-testing"
  version: string;
  description: string;    // Short description for listing

  // Activation conditions
  activation: {
    mode: 'lazy' | 'eager' | 'conditional';
    condition?: string;   // e.g., "env.DISPLAY" or "file:/var/run/docker.sock"
  };

  // Context cost
  estimatedTokens: number;

  // Dependencies
  requires?: string[];    // Other skills or capabilities

  // Content
  skillPath: string;      // Path to SKILL.md
  rulesPath?: string;     // Optional rules to inject
}
```

## CLI Commands (Proposed)

```bash
# Installation
agent-relay skills install <name>      # Install from registry
agent-relay skills install <git-url>   # Install from git
agent-relay skills uninstall <name>
agent-relay skills update [name]

# Discovery
agent-relay skills list                # List installed
agent-relay skills search <query>      # Search registry
agent-relay skills info <name>         # Show details

# Project-level
agent-relay skills enable <name>       # Enable in current project
agent-relay skills disable <name>
agent-relay skills status              # Show what's active

# For agents
agent-relay skills manifest            # Output JSON for agent consumption
```

## Tasks

### global-skills-architecture
- [ ] Finalize directory structure
- [ ] Define skill manifest schema
- [ ] Define installation sources (registry, git, local)
- [ ] Document in ADR

Dependencies: none
Priority: high

### global-skills-cli
- [ ] Implement `skills install` command
- [ ] Implement `skills list` command
- [ ] Implement `skills enable/disable` for projects
- [ ] Add to existing CLI

Dependencies: global-skills-architecture
Priority: high

### global-skills-registry
- [ ] Decide on registry approach (npm? custom? github releases?)
- [ ] Implement registry client
- [ ] Create initial skill packages

Dependencies: global-skills-architecture
Priority: medium

### global-skills-agent-discovery
- [ ] How agents see global skills in manifest
- [ ] Namespace handling (@relay/ prefix?)
- [ ] Integration with existing skills system

Dependencies: global-skills-cli
Priority: medium

### global-skills-cloud-sync
- [ ] Sync user skill preferences to cloud
- [ ] Cloud workspace skill provisioning
- [ ] Per-workspace skill overrides

Dependencies: global-skills-agent-discovery
Priority: low

### initial-skill-pack
- [ ] Create @relay/workspace-capabilities skill
- [ ] Create @relay/browser-testing skill
- [ ] Create @relay/container-spawning skill
- [ ] Create @relay/debugging-patterns skill

Dependencies: global-skills-cli
Priority: medium

## Example User Flow

```bash
# User installs agent-relay
npm install -g agent-relay

# User wants browser testing capabilities
agent-relay skills search browser
# Found: @relay/browser-testing - Playwright, screenshots, VNC for browser automation

agent-relay skills install @relay/browser-testing
# Installed @relay/browser-testing v1.0.0 to ~/.agent-relay/skills/

# In a project where they want it
cd my-project
agent-relay skills enable browser-testing
# Enabled @relay/browser-testing for this project

# Agent now sees in skills manifest:
# - Project skills (from .openskills/)
# - Global skills (from ~/.agent-relay/skills/, filtered by enabled)
```

## Relationship to Workspace Capabilities

This solves the "how do agents know" problem from workspace-capabilities.tasks.md:

1. **Skills are documentation** - they tell agents what's possible
2. **Capabilities are runtime** - they're what's actually available
3. **Skills can check capabilities** - `activation.condition: "env.DISPLAY"`

An agent loads the browser-testing skill → learns the APIs → calls MCP tools → tools check if Xvfb is running.

## Notes

- Skills are NOT MCP tools (those are separate)
- Skills are context/documentation that help agents use tools effectively
- Skills can reference MCP tools in their content
- Keep skills focused and small (estimate tokens)

See also:
- `docs/tasks/workspace-capabilities.tasks.md` - Runtime capability discovery
- `docs/design/e2b-sandbox-integration.md` - Alternative execution backends

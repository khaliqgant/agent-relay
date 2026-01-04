# Custom Relay Commands: Design Spec

> **Status:** Proposal
> **Decision Required:** Which implementation approach?
> **Created:** 2026-01-04

---

## Overview

Allow users to define custom command patterns that trigger code execution when agents output them.

```
->deploy:staging     →  executes user-defined deploy script
->jira:create "Bug"  →  runs Jira integration, returns ticket ID
->test:e2e           →  runs tests, injects results back to agent
```

---

## Use Cases

### DevOps & CI/CD
```
->deploy:staging              # Deploy to environment
->rollback:prod               # Rollback last deployment
->build:docker                # Build and push container
```

### Integrations
```
->jira:create "Login broken"  # Create ticket, return ID
->slack:#team "Build done"    # Post to Slack channel
->github:pr "Feature X"       # Create pull request
```

### Testing & Quality
```
->test:unit                   # Run unit tests
->test:e2e --headed           # Run E2E with browser
->lint:fix                    # Run linter with autofix
```

### Context & Knowledge
```
->load:api-docs               # Inject API documentation
->search:codebase "auth"      # Search and inject results
->context:clear               # Clear injected context
```

### Agent Coordination
```
->assign:Alice "Review PR"    # Assign task + notify
->escalate:Lead "Blocked"     # Escalate with context
->handoff:Bob                 # Transfer work to another agent
```

---

## Design Options

### Option A: Script Directory (Convention-Based)

**Pattern:** `->cmd:{name} {args}` → `.relay/commands/{name}.sh {args}`

```
.relay/
  commands/
    deploy.sh      # ->cmd:deploy staging
    test.sh        # ->cmd:test unit
    jira.sh        # ->cmd:jira create "Bug title"
```

**Example script:**
```bash
#!/bin/bash
# .relay/commands/deploy.sh
ENV="$1"
./scripts/deploy.sh "$ENV" 2>&1
echo "[DEPLOY] Completed deployment to $ENV"
```

**Pros:**
- Zero configuration
- Works with any language (bash, python, node)
- Easy to understand

**Cons:**
- Single prefix (`->cmd:`)
- Limited pattern matching
- No validation or typing

---

### Option B: YAML Configuration

**Config file:** `.relay/commands.yaml`

```yaml
commands:
  # Simple script mapping
  deploy:
    pattern: "->deploy:{env}"
    run: "./scripts/deploy.sh $env"

  # With validation
  test:
    pattern: "->test:{suite}"
    run: "npm test -- --suite=$suite"
    validate:
      suite: ["unit", "e2e", "integration"]
    timeout: 300000

  # Integration with response handling
  jira:
    pattern: "->jira:create {title}"
    run: "node .relay/integrations/jira.js create '$title'"
    response: inject  # inject | silent | broadcast

  # Restricted command
  deploy-prod:
    pattern: "->deploy:prod"
    run: "./scripts/deploy.sh prod"
    security:
      requireApproval: true
      allowedAgents: ["Lead"]
```

**Pros:**
- Custom prefixes per command
- Validation rules
- Security controls
- Configurable response handling

**Cons:**
- Requires configuration
- YAML can get complex

---

### Option C: TypeScript Handlers (Programmatic)

**Handler file:** `.relay/commands/deploy.ts`

```typescript
import { defineCommand, type CommandContext } from 'agent-relay';

export default defineCommand({
  // Pattern with named captures
  pattern: /^->deploy:(?<env>staging|prod)$/,

  // Optional validation
  validate({ env }) {
    if (env === 'prod' && !process.env.PROD_DEPLOY_ENABLED) {
      return 'Production deploys are disabled';
    }
  },

  // Execution
  async execute(ctx: CommandContext) {
    const { env } = ctx.match.groups;
    const { agent, inject, broadcast } = ctx;

    // Run deployment
    const result = await ctx.exec(`./deploy.sh ${env}`);

    // Inject response to calling agent
    await inject(`[DEPLOY] ${env}: ${result.stdout}`);

    // Optionally notify others
    if (env === 'prod') {
      await broadcast(`Production deployed by ${agent.name}`);
    }

    // Return structured data (stored in message metadata)
    return {
      env,
      success: result.exitCode === 0,
      duration: result.duration,
    };
  },
});
```

**Auto-discovery:** All `.ts` files in `.relay/commands/` are loaded.

**Pros:**
- Full programmatic control
- Type safety
- Can interact with relay (inject, broadcast, spawn)
- Async/await support
- Structured return data

**Cons:**
- Requires TypeScript knowledge
- More complex setup
- Needs compilation step

---

### Option D: Hybrid (Recommended)

Combine A + B: Convention with optional configuration.

**Default behavior (zero config):**
```
->cmd:deploy staging  →  .relay/commands/deploy.sh staging
```

**With config (opt-in):**
```yaml
# .relay/commands.yaml
commands:
  deploy:
    pattern: "->deploy:{env}"  # Custom prefix
    run: ".relay/commands/deploy.sh $env"

  # Or inline script
  notify:
    pattern: "->notify:{channel} {message}"
    run: |
      curl -X POST "$SLACK_WEBHOOK" \
        -d "{\"channel\": \"$channel\", \"text\": \"$message\"}"
```

**Progression:**
1. Start with `->cmd:name` convention (no config)
2. Add `.relay/commands.yaml` when you need custom patterns
3. Use `.ts` handlers for complex logic (future)

---

## Response Handling

| Mode | Behavior | Use Case |
|------|----------|----------|
| `inject` | Output sent to calling agent | Default - agent sees result |
| `silent` | No response | Fire-and-forget (notifications) |
| `broadcast` | Output to all agents | Team-wide announcements |
| `reply:{agent}` | Output to specific agent | Targeted responses |

**Default:** `inject` (most useful for agent workflows)

---

## Security Model

### Execution Context
- Commands run in project directory
- Inherit environment from daemon
- Can access `RELAY_*` env vars

### Access Control (Optional)
```yaml
commands:
  deploy-prod:
    pattern: "->deploy:prod"
    run: "./deploy.sh prod"
    security:
      # Require human approval in dashboard
      requireApproval: true

      # Restrict to specific agents
      allowedAgents: ["Lead", "DevOps"]

      # Rate limiting
      rateLimit: "1/hour"

      # Audit logging
      audit: true
```

### Sandboxing (Future)
- Optional Docker/VM isolation
- Resource limits (CPU, memory, time)
- Network restrictions

---

## Implementation Plan

### Phase 1: Script Directory (MVP)
- [ ] Detect `->cmd:{name}` pattern in parser
- [ ] Execute `.relay/commands/{name}.sh` with args
- [ ] Inject stdout back to agent
- [ ] Handle errors gracefully

### Phase 2: YAML Configuration
- [ ] Parse `.relay/commands.yaml`
- [ ] Support custom patterns
- [ ] Add validation rules
- [ ] Response mode configuration

### Phase 3: Dashboard Integration
- [ ] Show command executions in dashboard
- [ ] Approval workflow UI
- [ ] Audit log viewer

### Phase 4: TypeScript Handlers (Future)
- [ ] Hot-reload `.ts` command files
- [ ] Provide `CommandContext` API
- [ ] Type definitions package

---

## Decision Required

**Which approach should we implement first?**

| Option | Complexity | Flexibility | Time to MVP |
|--------|------------|-------------|-------------|
| A. Script Directory | Low | Low | 1-2 days |
| B. YAML Config | Medium | High | 3-5 days |
| C. TypeScript | High | Very High | 1-2 weeks |
| D. Hybrid (A→B) | Low→Medium | Progressive | 2 days + iterate |

**Recommendation:** Option D (Hybrid)
- Ship script directory first (works immediately)
- Add YAML config based on user feedback
- TypeScript handlers as future enhancement

---

## Open Questions

1. **Prefix:** Single `->cmd:` or allow any `->prefix:`?
2. **Discovery:** Auto-discover scripts or require registration?
3. **Async:** How to handle long-running commands (>30s)?
4. **Errors:** Inject error output or handle differently?
5. **Chaining:** Can command output trigger another command?

---

## Examples

### Minimal Setup (Phase 1)
```bash
# Create command
mkdir -p .relay/commands
cat > .relay/commands/deploy.sh << 'EOF'
#!/bin/bash
echo "Deploying to $1..."
./scripts/deploy.sh "$1"
echo "Done!"
EOF
chmod +x .relay/commands/deploy.sh

# Agent uses it
->cmd:deploy staging
```

### With Configuration (Phase 2)
```yaml
# .relay/commands.yaml
commands:
  deploy:
    pattern: "->deploy:{env}"
    run: ".relay/commands/deploy.sh $env"
    validate:
      env: ["staging", "prod"]
    security:
      requireApproval:
        when: "$env == 'prod'"
```

---

*Spec created 2026-01-04*

# Proposal: Shadow Agents as Subagents

## Summary

Replace the current shadow agent implementation (separate full agent processes) with Claude Code's native Task tool subagent model. This reduces resource usage and provides tighter integration, but limits shadow functionality to Claude Code agents.

## Current Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Primary Agent  │     │  Shadow Agent   │
│  (Full Process) │     │  (Full Process) │
│                 │     │                 │
│  - PTY wrapper  │     │  - PTY wrapper  │
│  - Relay client │     │  - Relay client │
│  - Full CLI     │     │  - Full CLI     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │   Daemon    │
              │   Router    │
              │             │
              │ shadowsByPrimary Map │
              │ Message copying      │
              │ Trigger emission     │
              └─────────────┘
```

**Problems:**
1. Two full agent processes = 2x resource usage
2. Shadow spawns as separate process with 3s delay
3. Complex message copying through daemon router
4. Shadow needs full relay client, PTY wrapper, etc.

## Proposed Architecture

```
┌─────────────────────────────────────────┐
│           Primary Agent (Claude Code)    │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │         Task Tool Subagent          │ │
│  │         (Shadow Role)               │ │
│  │                                     │ │
│  │  - Shares parent context            │ │
│  │  - No separate process              │ │
│  │  - Returns results to parent        │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  - Single PTY wrapper                    │
│  - Single relay client                   │
└──────────────────────────────────────────┘
```

**Benefits:**
1. Single process, ~50% resource reduction
2. Instant subagent spawn (no 3s delay)
3. Direct context sharing (no message copying)
4. Simpler architecture

## Shadow CLI Selection Logic

The shadow approach depends on what the **primary agent** is running:

### Decision Tree

```
Primary Agent CLI?
│
├─ Claude Code (`claude`)
│   └─ Shadow runs as: Claude subagent (Task tool)
│
├─ OpenCode (`codex`)
│   └─ Shadow runs as: OpenCode subagent (mode: subagent)
│
└─ Other (gemini, custom, etc.)
    └─ Shadow runs as: External process using best available CLI
        │
        ├─ Check: Is Claude authenticated?
        │   └─ Yes → Spawn shadow using `claude`
        │
        └─ Check: Is OpenCode authenticated?
            └─ Yes → Spawn shadow using `codex`
            └─ No → Error: No shadow CLI available
```

### Implementation

```typescript
function selectShadowCli(primaryCli: string): { cli: string; mode: 'subagent' | 'process' } {
  // Native subagent support
  if (primaryCli === 'claude') {
    return { cli: 'claude', mode: 'subagent' };
  }
  if (primaryCli === 'codex' || primaryCli === 'opencode') {
    return { cli: primaryCli, mode: 'subagent' };
  }

  // Fallback: spawn external shadow process
  // Check authenticated CLIs in preference order
  if (isAuthenticated('claude')) {
    return { cli: 'claude', mode: 'process' };
  }
  if (isAuthenticated('codex')) {
    return { cli: 'codex', mode: 'process' };
  }

  throw new Error('No shadow-capable CLI authenticated. Install Claude or OpenCode.');
}
```

### Behavior by Mode

| Mode | Description | Resource Usage | Latency |
|------|-------------|----------------|---------|
| `subagent` | Shadow runs inside primary's context via Task tool | Low (shared process) | ~1s |
| `process` | Shadow spawns as separate agent process | High (new process) | ~3-5s |

### Authentication Check

Need to detect which CLIs are available and authenticated:

```typescript
async function isAuthenticated(cli: 'claude' | 'codex'): Promise<boolean> {
  try {
    if (cli === 'claude') {
      // Check for Claude API key or OAuth
      const result = await exec('claude --version');
      return result.exitCode === 0;
    }
    if (cli === 'codex') {
      // Check for OpenCode auth
      const result = await exec('codex --version');
      return result.exitCode === 0;
    }
  } catch {
    return false;
  }
  return false;
}
```

### Example Scenarios

**Scenario 1: Claude primary agent**
```
Primary: claude (Lead agent)
Shadow: shadow-reviewer
→ Mode: subagent
→ Shadow invoked via Task tool inside Lead's context
→ No new process spawned
```

**Scenario 2: OpenCode primary agent**
```
Primary: codex (Implementer)
Shadow: shadow-auditor
→ Mode: subagent
→ Shadow invoked as OpenCode subagent
→ No new process spawned
```

**Scenario 3: Custom/Gemini primary agent**
```
Primary: gemini (Analyst)
Shadow: shadow-reviewer
→ Mode: process (gemini doesn't support subagents)
→ Check: Claude authenticated? Yes
→ Spawn separate `claude` process running shadow-reviewer agent
→ Shadow monitors via relay message copying (current architecture)
```

**Scenario 4: No shadow CLI available**
```
Primary: custom-agent
Shadow: shadow-reviewer
→ Check: Claude authenticated? No
→ Check: OpenCode authenticated? No
→ Error: "Shadow agents require Claude or OpenCode. Please authenticate one."
```

## Implementation Plan

### Phase 1: Shadow Agent Definition

Create shadow agent files in `.claude/agents/` that can be spawned via Task tool:

```markdown
# .claude/agents/shadow-reviewer.md
---
name: shadow-reviewer
description: Reviews code changes for quality and security issues
model: haiku
agentType: agent
---

# Shadow Reviewer

You are a shadow agent monitoring another agent's work. You receive periodic
updates about their progress and provide review feedback.

## Triggers

You will be invoked when:
- **CODE_WRITTEN**: Code has been written or modified
- **REVIEW_REQUEST**: Explicit review requested
- **SESSION_END**: Work session is ending

## Review Process

1. Analyze the changes provided in your context
2. Check for:
   - Security vulnerabilities
   - Code quality issues
   - Missing error handling
   - Test coverage gaps
3. Provide concise, actionable feedback
4. Flag blocking issues vs suggestions

## Output Format

**Review: [PASS/CONCERNS/BLOCK]**

[Your feedback here]
```

### Phase 2: Shadow Invocation Hook

Add a hook or snippet that primary agents include to invoke shadows at trigger points:

```markdown
# .claude/snippets/shadow-integration.md

## Shadow Integration

When configured with a shadow, invoke your shadow agent at these points:

### On Code Written
After writing significant code changes, invoke shadow:
\`\`\`
Use the Task tool with subagent_type="shadow-reviewer" to review your recent changes.
Provide context: files changed, purpose of changes, any concerns.
\`\`\`

### On Session End
Before completing a session, get shadow sign-off:
\`\`\`
Use the Task tool with subagent_type="shadow-reviewer" for final review.
Summarize all changes made this session.
\`\`\`

### On Explicit Request
When asked for review or when uncertain:
\`\`\`
Use the Task tool with subagent_type="shadow-reviewer" for guidance.
\`\`\`
```

### Phase 3: Automatic Shadow Configuration

Update agent frontmatter to declare shadow requirements:

```yaml
---
name: lead-developer
description: Lead developer agent
shadow: shadow-reviewer      # Auto-invoke this shadow
shadowTriggers:
  - CODE_WRITTEN
  - SESSION_END
---
```

When an agent with `shadow` config runs:
1. Shadow agent definition loaded into context
2. Primary agent instructed to invoke shadow at trigger points
3. Shadow runs as Task subagent, returns to primary
4. Primary incorporates feedback

### Phase 4: Dashboard Integration

Update SpawnModal to configure shadow-as-subagent:

```typescript
interface SpawnConfig {
  name: string;
  command: string;
  // New shadow-as-subagent fields
  shadowAgent?: string;        // Name of shadow agent to use
  shadowTriggers?: SpeakOnTrigger[];
  shadowModel?: 'haiku' | 'sonnet' | 'opus';
}
```

Dashboard spawns single agent with shadow config injected into its context.

## API Changes

### Remove
- `shadowOf` field from SpawnAgentRequest (no separate shadow process)
- `shadowSpeakOn` field from SpawnAgentRequest
- Shadow binding protocol (SHADOW_BIND, SHADOW_UNBIND)
- Router shadow copying logic

### Add
- `shadowAgent` field - which agent definition to use as shadow
- `shadowTriggers` field - when shadow should be invoked
- `shadowModel` field - model for shadow subagent (default: haiku for cost)

### Keep (for backwards compat)
- Existing shadow process model as fallback for non-Claude agents
- Config file shadow definitions

## Migration Path

1. **Deprecate** process-based shadows for Claude agents
2. **Add** subagent shadow support
3. **Default** new Claude agent shadows to subagent model
4. **Keep** process model for non-Claude agents
5. **Remove** process model for Claude after validation period

## File Changes

| File | Change |
|------|--------|
| `src/bridge/shadow-cli.ts` | **NEW** - Shadow CLI selection logic (`selectShadowCli`, `isAuthenticated`) |
| `src/bridge/spawner.ts` | Update to use `selectShadowCli`, handle subagent vs process modes |
| `src/dashboard/types/index.ts` | Add `shadowAgent`, `shadowTriggers`, `shadowMode` fields |
| `src/dashboard/react-components/SpawnModal.tsx` | Update UI - show shadow mode (subagent/process) based on primary CLI |
| `.claude/agents/shadow-*.md` | Create Claude Code shadow agent definitions |
| `.opencode/agent/shadow-*.md` | Create OpenCode shadow agent definitions |
| `src/cli/index.ts` | Update `--shadow` handling to use new selection logic |
| `CLAUDE.md` or agent snippets | Add shadow invocation instructions for subagent mode |

## Shadow Agent Profiles

### Claude Code Agents (`.claude/agents/`)

#### shadow-reviewer.md
```markdown
---
name: shadow-reviewer
description: Reviews code changes for quality, security, and best practices. Use as a shadow to monitor and review another agent's code output.
model: haiku
agentType: agent
shadowTriggers:
  - CODE_WRITTEN
  - REVIEW_REQUEST
  - EXPLICIT_ASK
---

# 🔍 Shadow Reviewer

You are a shadow reviewer agent. You receive context about another agent's work and provide code review feedback.

## Your Role

- **Observe**: You receive summaries of code changes made by the primary agent
- **Review**: Analyze for quality, security, and best practices
- **Advise**: Provide actionable feedback, not implementation

## Review Checklist

When reviewing code changes:

1. **Security**
   - Input validation present?
   - No hardcoded secrets?
   - SQL injection / XSS risks?
   - Authentication/authorization correct?

2. **Quality**
   - Clear naming conventions?
   - Appropriate error handling?
   - No obvious bugs?
   - Follows existing patterns?

3. **Maintainability**
   - Reasonable complexity?
   - Comments where needed?
   - Tests included?

## Output Format

**Review: [PASS | CONCERNS | BLOCK]**

**Summary:** [One sentence]

**Issues Found:**
- [Issue 1]: [Severity: Low/Medium/High] - [Description]
- [Issue 2]: ...

**Suggestions:**
- [Optional improvements]

## Response Guidelines

- Be concise - primary agent is working, don't slow them down
- Focus on blocking issues first
- PASS if code is acceptable (doesn't need to be perfect)
- CONCERNS if there are non-blocking issues to address
- BLOCK only for security vulnerabilities or critical bugs
```

#### shadow-auditor.md
```markdown
---
name: shadow-auditor
description: Audits agent decisions and session outcomes for compliance and quality. Use as a shadow for end-of-session review.
model: haiku
agentType: agent
shadowTriggers:
  - SESSION_END
  - EXPLICIT_ASK
---

# 📋 Shadow Auditor

You are a shadow auditor agent. You review the decisions and outcomes of another agent's work session.

## Your Role

- **Audit**: Review decisions made during the session
- **Verify**: Check that requirements were met
- **Report**: Provide session summary and recommendations

## Audit Criteria

1. **Requirement Fulfillment**
   - Did the agent complete the requested task?
   - Were all acceptance criteria met?
   - Any scope creep or missed requirements?

2. **Decision Quality**
   - Were technical decisions reasonable?
   - Any risky shortcuts taken?
   - Appropriate use of tools?

3. **Process Adherence**
   - Followed project conventions?
   - Updated tracking (beads/issues)?
   - Communicated appropriately?

## Output Format

**Audit: [APPROVED | NEEDS_REVIEW | REJECTED]**

**Session Summary:**
- Task: [What was requested]
- Outcome: [What was delivered]
- Duration: [If known]

**Findings:**
- [Finding 1]: [Category] - [Description]

**Recommendations:**
- [For future sessions]

## Response Guidelines

- Review holistically, not line-by-line
- APPROVED for successful sessions
- NEEDS_REVIEW if follow-up required
- REJECTED only for critical failures
```

#### shadow-active.md
```markdown
---
name: shadow-active
description: Actively monitors all agent activity and provides real-time guidance. Use as a shadow for high-stakes or learning scenarios.
model: sonnet
agentType: agent
shadowTriggers:
  - ALL_MESSAGES
---

# 👁️ Shadow Active Monitor

You are an active shadow agent. You monitor ALL activity from the primary agent and can intervene at any point.

## Your Role

- **Monitor**: See every message and action
- **Guide**: Provide real-time suggestions
- **Intervene**: Flag issues before they become problems

## When to Speak

Speak up when you observe:
- Security risk about to be introduced
- Significant architectural mistake
- Misunderstanding of requirements
- About to modify wrong files
- Potential data loss operation

Stay silent when:
- Work is progressing normally
- Minor style differences
- Decisions within acceptable range

## Output Format

**[GUIDANCE | WARNING | STOP]**

[Your message - keep it brief]

## Response Guidelines

- Don't micromanage - trust the primary agent
- Only intervene when value exceeds interruption cost
- GUIDANCE for suggestions
- WARNING for concerning patterns
- STOP for imminent problems
```

---

### OpenCode Agents (`.opencode/agent/`)

#### shadow-reviewer.md
```markdown
---
description: Reviews code changes for quality, security, and best practices. Use as a shadow subagent.
mode: subagent
model: anthropic/claude-3-5-haiku-20241022
temperature: 0.1
maxSteps: 3
tools:
  read: true
  write: false
  bash: false
  edit: false
permission:
  edit: deny
  bash: deny
---

You are a shadow reviewer agent. You receive context about code changes and provide review feedback.

## Review Checklist

1. **Security**: Input validation, no secrets, injection risks, auth
2. **Quality**: Naming, error handling, bugs, patterns
3. **Maintainability**: Complexity, comments, tests

## Output Format

**Review: [PASS | CONCERNS | BLOCK]**

**Summary:** [One sentence]

**Issues:** (if any)
- [Severity]: [Description]

Be concise. PASS if acceptable. BLOCK only for critical issues.
```

#### shadow-auditor.md
```markdown
---
description: Audits session decisions and outcomes for compliance. Use as end-of-session shadow.
mode: subagent
model: anthropic/claude-3-5-haiku-20241022
temperature: 0.1
maxSteps: 2
tools:
  read: true
  write: false
  bash: false
permission:
  edit: deny
---

You are a shadow auditor. Review the session's decisions and outcomes.

## Audit Criteria

1. **Requirements**: Task complete? Criteria met?
2. **Decisions**: Reasonable? Any shortcuts?
3. **Process**: Conventions followed? Tracking updated?

## Output Format

**Audit: [APPROVED | NEEDS_REVIEW | REJECTED]**

**Summary:** [Task requested → Outcome delivered]

**Findings:** (if any)

**Recommendations:** (if any)
```

#### shadow-active.md
```markdown
---
description: Active real-time monitor for high-stakes scenarios. Sees all messages.
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
maxSteps: 5
tools:
  read: true
  write: false
  bash: false
permission:
  edit: deny
---

You are an active shadow monitor. You see all activity and can intervene.

## When to Speak

SPEAK when you see:
- Security risk imminent
- Architectural mistake
- Requirements misunderstanding
- Wrong files about to be modified

STAY SILENT when:
- Work progressing normally
- Minor style differences
- Acceptable decisions

## Output Format

**[GUIDANCE | WARNING | STOP]**: [Brief message]

Don't micromanage. Only intervene when value > interruption cost.
```

---

### PRPM Package Structure

Distribute shadow agents via prpm for easy installation:

```
@agent-relay/shadow-agents/
├── prpm.json
├── claude/
│   └── agents/
│       ├── shadow-reviewer.md
│       ├── shadow-auditor.md
│       └── shadow-active.md
└── opencode/
    └── agent/
        ├── shadow-reviewer.md
        ├── shadow-auditor.md
        └── shadow-active.md
```

#### prpm.json
```json
{
  "name": "@agent-relay/shadow-agents",
  "version": "1.0.0",
  "description": "Shadow agent profiles for code review, auditing, and active monitoring",
  "targets": {
    "claude": {
      "files": {
        "claude/agents/*.md": ".claude/agents/"
      }
    },
    "opencode": {
      "files": {
        "opencode/agent/*.md": ".opencode/agent/"
      }
    }
  },
  "tags": ["shadow", "review", "audit", "agents"],
  "activation": "eager"
}
```

#### Installation
```bash
# Install for Claude Code
prpm install @agent-relay/shadow-agents --target claude

# Install for OpenCode
prpm install @agent-relay/shadow-agents --target opencode

# Install for both
prpm install @agent-relay/shadow-agents
```

#### Usage After Installation

**Claude Code:**
```bash
# Primary agent with shadow reviewer
claude --shadow shadow-reviewer --shadow-role reviewer

# Or via Task tool in agent prompt
"Use Task with subagent_type='shadow-reviewer' to review changes"
```

**OpenCode:**
```bash
# Configure in opencode.json
{
  "agent": {
    "shadow-reviewer": {
      "mode": "subagent"
    }
  }
}

# Then invoke via agent command
opencode agent shadow-reviewer "Review these changes: ..."
```

## Cost Considerations

| Model | Shadow Invocations | Est. Cost/Session |
|-------|-------------------|-------------------|
| Haiku | 5-10 per session | ~$0.05-0.10 |
| Sonnet | 5-10 per session | ~$0.50-1.00 |
| Opus | 5-10 per session | ~$2.50-5.00 |

**Recommendation:** Default to Haiku for shadows unless review quality requires higher model.

## Open Questions

1. **Trigger Mechanism**: How does primary know when to invoke shadow?
   - Option A: Explicit instruction in agent prompt (simplest)
   - Option B: Hook that monitors output patterns (automatic)
   - Option C: Periodic invocation (every N tool calls)
   - **Recommendation**: Start with Option A, iterate to B

2. **Context Passing**: What context does shadow receive?
   - Option A: Full conversation history (expensive, thorough)
   - Option B: Recent changes only (efficient, may miss context)
   - Option C: Configurable context window (flexible)
   - **Recommendation**: Option C with sensible defaults

3. **Feedback Integration**: How does primary handle shadow feedback?
   - Option A: Shadow feedback shown to user only
   - Option B: Primary must address feedback before continuing (blocking)
   - Option C: Advisory only, primary decides (non-blocking)
   - **Recommendation**: Option C for reviewer, Option B for BLOCK verdicts

4. **Process Mode Communication**: For non-Claude/OpenCode primaries, how does shadow receive context?
   - Option A: Relay message copying (current architecture)
   - Option B: Periodic context dump to shadow
   - Option C: Shadow polls primary's session state
   - **Recommendation**: Option A (already implemented)

## Success Metrics

- [ ] Shadow invocation adds < 5s latency
- [ ] Resource usage reduced by 40%+
- [ ] Shadow feedback quality maintained
- [ ] No breaking changes for existing users
- [ ] Clear migration path documented

## Timeline

- **Week 1**: Create shadow agent definitions, test Task tool invocation
- **Week 2**: Update SpawnModal UI, implement context injection
- **Week 3**: Add trigger detection, integrate feedback loop
- **Week 4**: Testing, documentation, migration guide

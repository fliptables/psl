---
status: pending
priority: p2
issue_id: "026"
tags: [code-review, security, ticket]
---

# Config directory created with overly permissive defaults

## Problem Statement

`packages/ticket/src/config.ts` creates `~/.config/psl/` with `mkdir({ recursive: true })` using default permissions (~0o755). Any local user can list the directory contents. The file itself is written with 0o600, but the directory should also be restricted.

## Proposed Solutions

1. Add `mode: 0o700` to the mkdir call: `await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 })`

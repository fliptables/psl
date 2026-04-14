---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, architecture, dry]
---

# findPslMd() is duplicated across plugin and ticket packages

## Problem Statement

`findPslMd()` is duplicated in `packages/plugin/server/src/index.ts` (lines 24-38) and `packages/ticket/src/index.ts` (lines 11-25). One uses `readFile` to probe existence, the other uses `stat`. Both walk up 10 parent directories. This will diverge over time.

## Proposed Solutions

1. **(Preferred)** Add a `@psl/core/node` subpath export for Node-specific utilities — add `packages/core/src/node.ts` with a separate tsup entry point that uses `node:fs`. This keeps `@psl/core` browser-safe while sharing the implementation.
2. Alternatively, create a shared utility in a place both packages import from.

---
status: pending
priority: p3
issue_id: "036"
tags: [code-review, init, quality]
---

# Unnecessary re-export proxy in analyzer.ts

## Problem Statement

`packages/init/src/analyzer.ts` re-exports `toKebab` and `stripSuffix` from `@psl/core`, then `scanner.ts` imports them from `./analyzer.js` instead of from `@psl/core` directly. This obscures the true dependency and makes it harder to trace where these utilities originate.

## Proposed Solutions

1. Have `scanner.ts` import `{ toKebab }` directly from `@psl/core` and remove the re-export from `analyzer.ts`

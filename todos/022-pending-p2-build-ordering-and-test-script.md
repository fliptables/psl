---
status: pending
priority: p2
issue_id: "022"
tags: [code-review, architecture, build]
---

# Build ordering is undefined and test script is broken

## Problem Statement

Two build issues:

1. Root `npm run build --workspaces` has no dependency ordering — `@psl/init` may build before `@psl/core`, causing failure.
2. `@psl/core`'s test script is `node --test dist/test/*.js` but tsup only compiles `src/index.ts`, not the `test/` directory. Tests won't run via `npm test`.

## Proposed Solutions

1. Change root build to `npm run build -w @psl/core && npm run build --workspaces` or adopt turbo/nx for proper dependency-aware build orchestration
2. Change the test script to `tsx --test test/core.test.ts` (tsx is already a devDependency)

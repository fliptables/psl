---
status: pending
priority: p1
issue_id: "011"
tags: [code-review, architecture, chrome]
---

# Chrome extension build externalizes @psl/core, breaking runtime loading

## Problem Statement

The Chrome extension build script (`packages/chrome/package.json`) uses `tsup` which by default externalizes dependencies listed in `package.json`. `@psl/core` is listed as a dependency, so it gets externalized — but Chrome extensions have no `node_modules` resolution at runtime. The extension will fail to load with an unresolved import error for `@psl/core`. This is a blocking ship issue.

## Proposed Solutions

1. Add `--noExternal @psl/core` to the tsup command in the build script, or use a `tsup.config.ts` with `noExternal: ['@psl/core']`
2. Verify the built `dist/content.js` and `dist/background.js` contain the inlined core library code

## Acceptance Criteria

- [ ] `tsup` bundles `@psl/core` inline rather than externalizing it
- [ ] `dist/content.js` and `dist/background.js` contain inlined core library code
- [ ] Chrome extension loads without unresolved import errors

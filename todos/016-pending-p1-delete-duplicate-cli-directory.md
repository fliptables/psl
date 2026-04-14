---
status: pending
priority: p1
issue_id: "016"
tags: [code-review, cleanup]
---

# Legacy cli/ directory is a full duplicate of packages/init/ — delete it

## Problem Statement

The legacy `cli/` directory still exists with its own `package.json`, `node_modules/`, `src/`, and `dist/`. It is byte-for-byte identical to `packages/init/` except `analyzer.ts` still has local `toKebab`/`stripSuffix` instead of importing from `@psl/core`. It is approximately 2,000 lines of pure duplication, not listed in root workspaces, and will confuse contributors. Both have `"name": "psl-init"` — publishing from the wrong directory would ship the wrong package.

## Proposed Solutions

1. Delete the entire `cli/` directory — `packages/init/` is the canonical replacement
2. Verify no scripts, CI configs, or documentation reference `cli/` before deleting

## Acceptance Criteria

- [ ] `cli/` directory is deleted
- [ ] No references to `cli/` remain in scripts, CI configs, or documentation
- [ ] `packages/init/` is the sole location for the init package

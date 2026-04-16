---
status: pending
priority: p2
issue_id: "023"
tags: [code-review, architecture, publishing]
---

# Wildcard version specifier for @psl/core is a publishing hazard

## Problem Statement

All consumer packages use `"@psl/core": "*"` which resolves to the local workspace during development but would pull any registry version when published. This is a latent publishing hazard — a published package could silently pick up an incompatible version of `@psl/core`.

## Proposed Solutions

1. Change to `"@psl/core": "^1.0.0"` in all consumer `package.json` files
2. Add a prepublish check that verifies version alignment across all workspace packages

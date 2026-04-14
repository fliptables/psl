---
status: pending
priority: p1
issue_id: "015"
tags: [code-review, core, parser]
---

# Child tokens are unreachable via resolver — entire child token system is invisible to runtime

## Problem Statement

The parser registers top-level tokens in `vocab.tokens` via `registerToken()`, but child tokens (e.g., `drag-handle` under `inspector`, `tabs` under `editor`) are stored only inside their parent's `children` array — they are NOT added to `vocab.tokens`. This means:

- `resolve("drag-handle", vocab)` returns `found: false`
- `resolveDetailed("drag-handle")` fails
- `search("drag")` finds nothing
- `validate("{scape.drag-handle}")` reports unknown segment

The entire child token system is invisible to the runtime. The `buildPath()` function also only walks one level up, so it can never produce a 3+ level path.

## Proposed Solutions

1. In `parser.ts`, call `registerToken()` for ALL tokens including children (recursively)
2. Alternatively, build a flat index during parse that maps every canonical name (at any nesting depth) to its token
3. Fix `buildPath()` to build a parent-index during parse time rather than doing O(n) scans

## Acceptance Criteria

- [ ] `resolve()` can find child tokens at any nesting depth
- [ ] `search()` returns results for child token names
- [ ] `validate()` accepts paths containing child token segments
- [ ] `buildPath()` produces correct paths for 3+ level hierarchies

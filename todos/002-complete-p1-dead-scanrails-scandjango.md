---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, dead-code, scanner]
---

# Dead `scanRails` and `scanDjango` functions never called

## Problem Statement

`scanRails` (scanner.ts:364-403) and `scanDjango` (scanner.ts:405-430) are the original directory-based scanners. The `scan()` switch block routes `"rails"` and `"django"` to `scanRuby()` and `scanPython()` respectively. The old functions have zero callers.

They carry stale logic that will confuse maintainers and may be incorrectly "revived."

## Findings

- **TypeScript reviewer**: items #10 and #11 — Rails gets generic Ruby analysis instead of the richer controller-aware logic
- **Architecture reviewer**: confirmed dead code, maintenance hazard
- **Simplicity reviewer**: ~65 lines to delete

## Proposed Solutions

1. Delete both functions entirely. If Rails/Django-specific enhancements are needed later, they should augment `scanRuby`/`scanPython`.

## Technical Details

- **Files**: `cli/src/scanner.ts`, lines 364-430

## Acceptance Criteria

- [ ] `scanRails` and `scanDjango` are removed
- [ ] No compilation errors after removal

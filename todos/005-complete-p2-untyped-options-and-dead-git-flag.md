---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, typescript, dead-code]
---

# Untyped commander options + `--git` flag is inert

## Problem Statement

1. `index.ts:18` — commander's `options` is `any`. No compile-time safety if flag names change.
2. `index.ts:15` — `--git` flag is advertised in CLI help but never read in `scanner.ts`. Users will think it does something.

Also: `TSX_IMPORT_PATTERN` (analyzer.ts:86) is defined but never used.

## Proposed Solutions

1. Define `interface CliOptions` and type the action callback.
2. Remove `--git` flag until it's implemented.
3. Delete unused `TSX_IMPORT_PATTERN`.

## Technical Details

- **Files**: `cli/src/index.ts` lines 15, 18; `cli/src/analyzer.ts` line 86

## Acceptance Criteria

- [ ] `options` is typed with `CliOptions` interface
- [ ] `--git` flag removed from CLI
- [ ] `TSX_IMPORT_PATTERN` deleted

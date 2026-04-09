---
status: complete
priority: p3
issue_id: "009"
tags: [code-review, consistency, refactor]
---

# Inconsistent scanner return types and source field

## Problem Statement

8 graph-based scanners return `{ areas: AreaToken[]; mermaid: string }`. 4 old-style scanners return `AreaToken[]` only. This inconsistency forces the switch block to handle them differently and produces two different mermaid quality levels (graph-based with complexity emoji vs flat).

Additionally:
- `AreaToken.source` is set throughout scanning but never read by the generator — dead field
- `buildGraph` returns `{ roots, all }` but `all` is never used by any caller
- Go, Rust, Python, Java, Ruby all hardcode `source: "view"` regardless of actual content type

## Proposed Solutions

1. Standardize all scanners to return `{ areas, mermaid }` (even the old ones can use `generateMermaid`)
2. Remove `source` field from `AreaToken` or actually use it in generator output
3. Remove `all` from `buildGraph` return type

## Technical Details

- **Files**: `cli/src/scanner.ts`, `cli/src/analyzer.ts`

## Acceptance Criteria

- [ ] All scanner functions return the same shape
- [ ] No unused fields in return types

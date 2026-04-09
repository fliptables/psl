---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, dry, refactor]
---

# Duplicate utility functions across scanner.ts and analyzer.ts

## Problem Statement

Three categories of duplication:

1. `toKebabCase` (scanner.ts:70) and `toKebab` (analyzer.ts:750) — identical implementations, different names.
2. `stripSuffix` (scanner.ts:80) is the generic version; `stripSwiftSuffix`, `stripReactSuffix`, `stripPythonSuffix`, `stripJavaSuffix`, `stripRubySuffix` (analyzer.ts:759-821) are 5 copies of the same algorithm with different suffix lists.
3. `generateMermaid` (scanner.ts:639) and `graphToMermaid` (analyzer.ts:597) — two mermaid generators with different feature sets.

Also: `stripPythonSuffix` lists "View" before "ViewSet" — `UserViewSet` strips to `UserSet` instead of `User`.

## Proposed Solutions

1. Export `toKebab` from analyzer.ts, delete `toKebabCase` from scanner.ts.
2. Replace 5 strip functions with suffix-list constants + shared `stripSuffix`.
3. Fix `stripPythonSuffix` ordering: "ViewSet" must come before "View".

## Technical Details

- **Files**: both `cli/src/scanner.ts` and `cli/src/analyzer.ts`
- ~50 lines removable

## Acceptance Criteria

- [ ] Single `toKebab` function shared between modules
- [ ] Single `stripSuffix` function with per-language suffix constants
- [ ] `UserViewSet` correctly strips to `User` (not `UserSet`)

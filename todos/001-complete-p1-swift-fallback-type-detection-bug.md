---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, bug, swift-analyzer]
---

# Swift fallback type detection captures wrong capture group

## Problem Statement

In `analyzer.ts:49-51`, the Swift analyzer's fallback regex `/(struct|class)\s+(\w+(?:View|Controller|SplitView))\b/` captures the keyword (`struct`/`class`) in group 1 and the type name in group 2. But `classMatch[1]` is used as the type name — this returns `"struct"` or `"class"`, not the actual type name.

The result is then cast with `as unknown as RegExpExecArray` to suppress the type mismatch, hiding the bug.

## Findings

- **Pattern Recognition reviewer**: `classMatch[1]` captures `"struct"`/`"class"` not the type name
- **TypeScript reviewer**: double-cast `as unknown as RegExpExecArray` is a type-safety escape hatch hiding the issue

## Proposed Solutions

1. Fix the capture group access to `classMatch[2]`, or restructure the regex to use a non-capturing group for the keyword: `/(?:struct|class)\s+(\w+(?:View|Controller|SplitView))\b/`

## Technical Details

- **File**: `cli/src/analyzer.ts`, lines 49-54

## Acceptance Criteria

- [ ] Swift files that only match the fallback regex produce correct type names
- [ ] No `as unknown as` casts remain in the function

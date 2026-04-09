---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, architecture, portability]
---

# INFRASTRUCTURE_NAMES contains Scape-specific component names

## Problem Statement

`analyzer.ts:426-432` hardcodes names like `pulsing-dot`, `base-tree-cell`, `pixel-avatar`, `starfield`, `hover-brighten` — all Scape macOS app components. These are applied to ALL languages via `buildGraph()`. Any project with a component named "starfield" or "pixel-avatar" would have it silently filtered out.

Additionally, `buildGraph` line 501 calls `stripSwiftSuffix` on all references regardless of language — a Go struct named `CodeEditorView` would be incorrectly stripped.

## Findings

- **Architecture reviewer**: items #4 and #5 — layering violation, product-specific knowledge in generic module
- **Simplicity reviewer**: confirmed as the most significant design problem
- **Pattern reviewer**: item #5 — `stripSwiftSuffix` used unconditionally

## Proposed Solutions

1. Remove all Scape-specific names from `INFRASTRUCTURE_NAMES`. Keep only the generic `LEAF_PATTERNS` which describe categories (buttons, handlers, helpers).
2. Replace `stripSwiftSuffix` in `buildGraph` line 501 with just `toKebab(ref)` — the infrastructure check should work on the raw type name.

## Technical Details

- **File**: `cli/src/analyzer.ts`, lines 426-445 and line 501

## Acceptance Criteria

- [ ] No Scape-specific names in `INFRASTRUCTURE_NAMES`
- [ ] `buildGraph` does not call any language-specific strip function
- [ ] `LEAF_PATTERNS` still filters generic patterns (button, icon, handler, helper, util)

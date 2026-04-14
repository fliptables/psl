---
status: pending
priority: p3
issue_id: "030"
tags: [code-review, security, chrome]
---

# escapeHtml() missing single quote escape

## Problem Statement

`escapeHtml()` in `content.ts` (lines 582-588) escapes `&`, `<`, `>`, `"` but not single quotes (`'`). No current exploit path exists since all template attributes use double quotes, but it is an incomplete implementation that could become a vulnerability if template patterns change.

## Proposed Solutions

1. Add `.replace(/'/g, "&#39;")` to the escape chain

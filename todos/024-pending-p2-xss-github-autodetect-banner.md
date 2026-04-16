---
status: pending
priority: p2
issue_id: "024"
tags: [code-review, security, chrome]
---

# XSS risk in GitHub auto-detect banner via innerHTML

## Problem Statement

The GitHub auto-detect banner in `content.ts` (lines 524-528) uses innerHTML with unescaped `owner` and `repo` values from `location.pathname`. While GitHub generally restricts HTML metacharacters in names, this is a defense-in-depth violation — a compromised or unexpected URL could inject HTML.

## Proposed Solutions

1. Apply `escapeHtml()` to `owner` and `repo` before inserting into innerHTML

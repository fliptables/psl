---
status: pending
priority: p3
issue_id: "034"
tags: [code-review, chrome, performance]
---

# scanForTokens() creates per-element mousemove listeners

## Problem Statement

`scanForTokens()` in `content.ts` creates a new `mousemove` handler closure per parent element containing PSL tokens. On a page with 50 tokens, that results in 50 mousemove listeners all firing on every mouse move, causing unnecessary overhead.

## Proposed Solutions

1. Use a single delegated `mousemove` listener on `document.body` instead of per-element listeners

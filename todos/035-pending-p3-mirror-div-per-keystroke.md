---
status: pending
priority: p3
issue_id: "035"
tags: [code-review, chrome, performance]
---

# Mirror div created and destroyed per keystroke

## Problem Statement

`getTextareaCursorPosition()` in `content.ts` creates and removes a mirror div DOM element on every input event for cursor position calculation. This causes unnecessary DOM churn on every keystroke in any monitored textarea.

## Proposed Solutions

1. Cache the mirror element and reuse it across calls, updating only the text content

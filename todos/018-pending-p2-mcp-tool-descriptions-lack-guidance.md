---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, plugin, agent-native]
---

# MCP tool descriptions lack guidance on when to use each tool

## Problem Statement

MCP tool descriptions are minimal and don't explain when to use each tool vs others, expected input format, or response shape. Example: if a user asks "is right-sidebar a valid PSL term?", an agent might call `psl_validate_token` (wrong — that validates token syntax like `{product.area}`) instead of `psl_resolve_alias` (correct). The `psl_validate_token` requires braces but an agent might pass just "right-sidebar" and get a false negative.

## Proposed Solutions

1. Expand each tool description to include: (a) when to use it vs others, (b) input format with examples, (c) response shape
2. Add a note to `psl_validate_token`: "To check if a single term exists, use psl_resolve_alias instead."
3. Consider auto-wrapping bare terms in braces or returning a helpful error when braces are missing

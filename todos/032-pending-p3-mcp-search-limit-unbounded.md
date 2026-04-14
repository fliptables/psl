---
status: pending
priority: p3
issue_id: "032"
tags: [code-review, plugin, security]
---

# MCP psl_search_vocab limit parameter is unbounded

## Problem Statement

`psl_search_vocab` MCP tool accepts `z.number().optional()` for the `limit` parameter with no bounds validation. Values like `limit: -1` or `limit: Infinity` would produce surprising or broken results.

## Proposed Solutions

1. Change the schema to `z.number().int().min(1).max(100).optional()` to enforce reasonable bounds

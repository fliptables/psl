---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, plugin, agent-native]
---

# MCP tools return impoverished output compared to Chrome extension

## Problem Statement

`psl_resolve_alias` MCP tool calls the thin `resolve()` function returning only `{ canonical: "inspector" }`, while the Chrome extension calls `resolveDetailed()` showing canonical name, aliases, section, description, and children. The `psl_search_vocab` tool hardcodes `aliases: []` with a comment "would need resolveDetailed for this". Agents get significantly less information than humans for the same operation. An agent cannot determine which section a token belongs to (area vs concern vs quality).

## Proposed Solutions

1. Change `psl_resolve_alias` to call `resolveDetailed()` and return full metadata (canonical name, aliases, section, description, children)
2. Populate the `aliases` field in search results by calling `resolveDetailed()` for each result
3. Add `section`, `description`, and `children` to search results

## Technical Details

- **File**: `packages/plugin/server/src/index.ts`, lines 92-115 and 141-169

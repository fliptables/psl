---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, plugin, reliability]
---

# fs.watch silently fails and is never re-established

## Problem Statement

MCP server's `watchPslMd()` in `packages/plugin/server/src/index.ts` (lines 69-82) silently catches all watcher errors. When PSL.md is deleted and recreated, the watcher dies and is never re-established. Additionally, `fs.watch` has known platform inconsistencies: duplicate events on macOS, may not fire for rename-and-replace saves on Linux.

## Proposed Solutions

1. Log watcher failures to stderr so they are visible in MCP server logs
2. Re-establish the watcher after a short delay when it errors or closes unexpectedly
3. Consider `fs.watchFile` as a polling fallback for robustness on platforms where `fs.watch` is unreliable

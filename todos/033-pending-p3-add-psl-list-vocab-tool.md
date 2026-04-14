---
status: pending
priority: p3
issue_id: "033"
tags: [code-review, plugin, agent-native]
---

# No MCP tool to browse the full vocabulary

## Problem Statement

No MCP tool lets an agent browse the full vocabulary. `search("")` returns empty results. An agent answering "what vocabulary is defined?" has to guess search terms, making discovery impossible without prior knowledge of the vocabulary contents.

## Proposed Solutions

1. Add a `psl_list_vocab` tool that returns all top-level tokens grouped by section (areas, concerns, qualities)

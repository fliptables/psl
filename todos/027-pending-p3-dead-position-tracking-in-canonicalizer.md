---
status: pending
priority: p3
issue_id: "027"
tags: [code-review, core, dead-code]
---

# Dead position tracking in canonicalizer

## Problem Statement

`packages/core/src/canonicalizer.ts` tracks a `position` field and maintains an `offset` accumulator. The sole consumer (MCP server) explicitly strips `position` from output, mapping only `original` and `canonical`. The position tracking is dead code that adds complexity to the replacement pipeline.

## Proposed Solutions

1. Remove the `position` field and `offset` tracking from the canonicalizer
2. Simplify the replacement type to `{ original: string; canonical: string }`

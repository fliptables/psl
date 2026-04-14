---
status: pending
priority: p2
issue_id: "025"
tags: [code-review, architecture]
---

# Phantom @psl/core dependency in ticket package

## Problem Statement

`packages/ticket/package.json` lists `"@psl/core": "*"` as a dependency, but no source file in `packages/ticket/src/` imports anything from `@psl/core`. The ticket CLI reads raw PSL.md content and passes it as a string to the LLM prompt. This is a phantom dependency that adds confusion and install weight for no benefit.

## Proposed Solutions

1. Remove `@psl/core` from ticket's dependencies if the package genuinely doesn't need it
2. **(Better)** Actually use `@psl/core` — parse the PSL.md with `@psl/core`, validate tokens in the LLM output against the parsed vocabulary, rather than relying on the LLM to self-validate

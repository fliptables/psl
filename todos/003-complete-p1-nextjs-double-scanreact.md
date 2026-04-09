---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, bug, nextjs, performance]
---

# Next.js projects run `scanReact` twice — duplicate areas and wasted I/O

## Problem Statement

`scanNextjs` (scanner.ts:358) internally calls `scanReact`. Then the `"nextjs"` switch case (scanner.ts:694-698) also calls `scanReact` separately and merges both results. Every `.tsx` file is read and analyzed twice. The component areas appear twice in the output.

## Findings

- **TypeScript reviewer**: item #9 — structural inconsistency + performance waste
- **Architecture reviewer**: item #2 — `scanReact` runs twice with identical inputs
- **Performance reviewer**: item #6 — 2x penalty for Next.js projects
- **Pattern reviewer**: item #3 — confirmed double execution

## Proposed Solutions

1. Remove the `scanReact` call from inside `scanNextjs`. Keep `scanNextjs` as a route-only scanner returning `AreaToken[]`. The `"nextjs"` switch case calls `scanReact` once and `scanNextjs` (routes only) once, then merges.

## Technical Details

- **File**: `cli/src/scanner.ts`, lines 317-362 and 693-699

## Acceptance Criteria

- [ ] `scanReact` is called exactly once for Next.js projects
- [ ] Route areas from `scanNextjs` are still included
- [ ] No duplicate component areas in output

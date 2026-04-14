---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, typescript, quality]
---

# Type safety issues across multiple files

## Problem Statement

Three type safety issues:

1. `content.ts` uses `(el as any).__pslAttached` — a runtime property attached via type assertion to `any`, bypassing TypeScript's type system.
2. `merge.ts` uses conditional type gymnastics `(typeof vocabs)[0]["tokens"] extends Map<string, infer T> ? T : never` — an unnecessarily complex way to extract a type that already exists.
3. `validator.ts` `hasDescendant` uses a circular self-referencing type `{ canonical: string; children: typeof token[] }` — a hand-rolled type that duplicates an existing interface.

## Proposed Solutions

1. Replace `(el as any).__pslAttached` with `const attachedTargets = new WeakSet<HTMLElement>()` and use `attachedTargets.has(el)` / `attachedTargets.add(el)` instead
2. Import `PslToken` from `@psl/core` and use `new Map<string, PslToken>()` directly
3. Change the `hasDescendant` parameter type to `PslToken`

## Technical Details

- **Files**: `content.ts:547-548`, `merge.ts:24`, `validator.ts:68`

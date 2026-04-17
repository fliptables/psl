---
date: 2026-04-16
topic: scanner-improvements
---

# psl-init Scanner Improvements

## Problem Frame

The `psl-init` scanner produces poor vocabulary output for most codebases. Testing against 4 real repos (aiera-dashboard, aiera-client-sdk, aiera-desktop, scape) revealed 3 critical bugs and a missing capability that caused near-total failure on 3 of 4 repos. The scanner should get users to ~70% accuracy so editing is faster than writing from scratch; currently it delivers ~20% for React projects.

## Requirements

- R1. Scanner must handle `.js` files for React projects (not just `.tsx`/`.jsx`)
- R2. ALL_CAPS constants must not be detected as React components
- R3. `index.tsx`/`index.jsx`/`index.js` files must be parsed, with component names derived from parent directory when the file is a barrel
- R4. Directory-based area detection for conventional directory patterns (`features/`, `modules/`, `pages/`, `views/`, `screens/`, `sections/`, `domains/`, `pods/`, `areas/`)
- R5. Infrastructure filter expanded to cover common UI primitives (icons, loaders, wrappers, arrows, chevrons, dots, badges, etc.)
- R6. Republish to npm as v1.1.0

## Success Criteria

- aiera-dashboard: produces meaningful areas (chat, editor, pdf, triggers, watchlist — not MIN, ALLOWED, CATEGORIES)
- aiera-desktop: produces >0 areas (was total failure with 0 files scanned)
- aiera-client-sdk: produces module-level areas (aiera-chat, transcript, event-list — not just "event")
- scape: maintains current quality, reduced noise from UI primitives
- All 4 repos scan in <5 seconds each

## Scope Boundaries

- No git co-change analysis in this pass (deferred — highest-impact future addition)
- No route parsing beyond existing Next.js support (deferred)
- No Louvain community detection (deferred)
- No identifier tokenization for naming (deferred)
- No changes to the output format (PSL.md structure stays the same)

## Key Decisions

- **Ship bug fixes + directory scanning only**: The 3 bug fixes alone transformed aiera-dashboard from 5 garbage areas to 20 good ones. Additional techniques (git, routes, Louvain) are documented for future iterations.
- **Republish immediately**: Current 1.0.0 on npm has the broken scanner. Bump to 1.1.0.

## Deferred to Future Iterations

Documented from expert research for future `/ce:brainstorm` sessions:
1. Git co-change analysis (`--git` flag) with Union-Find clustering + conventional commit scope mining
2. Route parsing across frameworks (React Router, Rails routes.rb, Express, Django urls.py)
3. Identifier tokenization (TF on split camelCase/kebab names per cluster)
4. Fan-in based infrastructure detection (replace blocklist with "referenced by 10+ files = utility")
5. Louvain community detection on import graph for flat codebases

## Next Steps

R1-R5 are already implemented and tested. Remaining work: commit, bump version, republish to npm.

→ Proceed directly to commit + publish

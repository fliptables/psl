# Brainstorm: PSL Ecosystem — Plugin, Chrome Extension, Transformer

**Date:** 2026-04-11
**Status:** Brainstorm complete, ready for planning
**Feature:** Make PSL easy to adopt from zero users via a three-artifact ecosystem sharing a common core library.

---

## What We're Building

A monorepo of four packages (plus the existing `psl-init` CLI) that together turn PSL from "a markdown convention nobody has used" into a tool people can pick up in five minutes.

**The three new surfaces:**

1. **`@psl/plugin`** — a Claude Code plugin published to the plugin marketplace. Contains:
   - A **skill** (`skills/psl/SKILL.md`) that auto-loads when `PSL.md` is present in the repo, teaching Claude the PSL rules and pointing it at canonical names / aliases.
   - **Slash commands**: `/psl init`, `/psl lookup <term>`, `/psl validate`, `/psl ticket "<natural language>"`.
   - A local **MCP server** exposing `psl_resolve_alias`, `psl_validate_token`, `psl_search_vocab`, `psl_canonicalize` so Claude *calls* resolution instead of re-parsing markdown each turn.

2. **`@psl/chrome`** — a Chrome extension that injects PSL token autocomplete into textareas on Jira, Linear, Slack web, GitHub, and any other site. PSL files are loaded by URL (with GitHub auto-detect on `github.com/owner/repo` pages). Typing `{` in a textarea opens a fuzzy-matched dropdown of canonical names across *all* loaded PSLs (global merge, product prefix disambiguates); hover over a PSL token shows its definition via `resolveDetailed()`. **v1 ships autocomplete + hover tooltips only** — no transformer action in the extension yet, which keeps the extension key-free and security-simple.

3. **`@psl/ticket`** — a promptable ticket generator. Takes natural-language input, asks clarifying questions, and outputs a **PSL-tagged markdown ticket + a separate engineer prompt** (see example below). Invocation paths in v1: the `/psl ticket` slash command in the plugin (runs in-session, no subprocess), and `npx psl-ticket` for anyone with Node. The CLI **auto-detects** `claude` on `$PATH` and prefers headless `claude -p`; falls back to Anthropic API with a key stored in `~/.config/psl/config.json`. Explicit `--backend claude-code|api` flag for override. Default model is **Haiku 4.5** (cheap, fast, template-filling workload); overridable with `--model`.

**The shared backbone:**

`@psl/core` — a pure TypeScript library extracted from the current `psl-init` source. Handles parsing, alias resolution, token validation, fuzzy search, and canonicalization. **No Node-only dependencies** so it bundles cleanly for the Chrome extension. Every other package depends on it, guaranteeing consistent semantics across surfaces. Resolution exposes **two functions**: `resolve('home') → 'dashboard'` (thin, used by the MCP tool response) and `resolveDetailed('home') → { canonical, path, aliases, matchedVia, definition }` (rich, used by the Chrome extension hover tooltip and the plugin's `lookup` command).

```
psl/
  packages/
    core/         # @psl/core — parse, resolve, validate, search
    init/         # existing psl-init CLI (moved here, no behavior change)
    plugin/       # Claude Code plugin (skill + commands + MCP server)
    chrome/       # Chrome extension (MV3)
    ticket/       # psl-ticket CLI (headless Claude + fallback API)
  PSL.md          # self-hosted example
```

**Example transformer output:**

```markdown
## Ticket: slow dashboard load
Tokens: {myapp.dashboard.performance.activity-feed}

**Problem.** The activity feed on the dashboard takes >2s to
render on cold load.

**Acceptance.** First paint < 500ms, interactive < 1s.

---

## Engineer prompt
> Investigate {myapp.dashboard.performance.activity-feed}.
> Start with the feed query in app/dashboard/feed/*.
> Acceptance: first paint < 500ms, interactive < 1s.
```

---

## Why This Approach

**1. PSL was designed for agents. A Claude plugin is the canonical integration, not a weird add-on.** The existing README already tells users to paste PSL instructions into their `CLAUDE.md`. The plugin formalizes that: zero manual copy-paste, auto-loading skill, and MCP tools that give Claude *reliable* resolution instead of best-effort markdown interpretation.

**2. First-user wow-moment drives scope.** The target is a solo dev running Claude Code in their own repo. The wow moment is `/plugin add psl` → on next prompt in a repo with no PSL.md, Claude offers `/psl init` → scan runs, draft PSL.md appears, skill auto-activates, Claude immediately uses canonical names. That flow needs the plugin, the MCP server, and the init command — everything else in the ecosystem is supporting cast for phase 2+ users.

**3. A shared `@psl/core` is non-negotiable for a spec-language project.** PSL's value *is* consistency. If the plugin, extension, and CLI each reimplement parsing, they *will* drift. Extracting a pure-TS library with no Node-only deps (so it bundles for the browser) costs us a refactor of the current `psl-init` sources but pays back immediately: a regex fix in one place propagates everywhere.

**4. File-based, no central service.** PSL.md lives in git. The Chrome extension fetches from URLs (including GitHub raw), caches aggressively, and auto-detects from `github.com/owner/repo` pages. No registry, no backend, no moderation problem, nothing to run. This also means we can ship without asking anyone to trust a hosted service.

**5. Defer the hosted web endpoint.** A "paste text, get PSL ticket" URL would be a great demo, but running a service that calls Anthropic with our key means real ops cost, abuse surface, and moderation concerns — for zero users. BYO-key everywhere in v1. Revisit in phase 2 once there's usage data.

**6. The transformer is one logic, two surfaces in v1.** `@psl/ticket` holds the system prompt and conversation flow. The plugin's slash command is a thin wrapper that invokes the same prompt inside the already-running Claude session (no subprocess). The standalone CLI auto-detects `claude -p` or falls back to the Anthropic API with a locally-stored user key. The Chrome extension **does not** get the transformer action in v1 — it ships autocomplete + hover only. Both transformer surfaces share the same output contract and the same `@psl/core` validation pass on generated tokens.

---

## Key Decisions

- **Target first user:** solo dev running Claude Code in their own repo. Wow moment = install → first-run auto-prompt → draft PSL.md → Claude immediately uses canonical names.
- **Plugin shape:** skill + slash commands + MCP server. **No hooks in v1** (enforcement would be opinionated and potentially scary for new users; revisit once the passive flow is proven).
- **Plugin commands:** `/psl init`, `/psl lookup <term>`, `/psl validate`, `/psl ticket "<natural language>"`.
- **MCP tool surface (v1):** `psl_resolve_alias`, `psl_validate_token`, `psl_search_vocab`, `psl_canonicalize`.
- **Architecture:** monorepo with `@psl/core` shared pure-TS library. Packages: `core`, `init`, `plugin`, `chrome`, `ticket`. PSL.md is the single source of truth — **no central service**.
- **`@psl/core` API shape:** two resolution functions — `resolve(term) → string` (thin, for MCP tool response bodies) and `resolveDetailed(term) → { canonical, path, aliases, matchedVia, definition }` (rich, for hover tooltips and `/psl lookup`).
- **Chrome extension discovery:** user-managed URL list (GitHub raw URLs or arbitrary URLs) plus auto-detect on `github.com/owner/repo` pages, with aggressive client-side caching. Options page shows loaded PSLs by product name.
- **Chrome extension scope (v1):** autocomplete on `{` trigger + hover tooltips on existing PSL tokens. **No transformer action in v1** — keeps the extension key-free and the security model trivial. MV3 extension, no native messaging.
- **Multi-PSL disambiguation in extension:** global merged autocomplete. All loaded PSLs are always active; product prefix is the namespace (`{myapp.*` vs `{other.*`). Zero per-domain configuration.
- **Transformer output contract:** markdown bundle = ticket section (with PSL tokens) + engineer prompt section. **No ticket-tracker integrations (Jira/Linear API) in v1** — per-vendor auth and field mapping is a tarpit. Output is plain markdown users can paste.
- **Transformer invocation paths in v1:** `/psl ticket` slash command in plugin, `npx psl-ticket` standalone CLI. **Hosted web endpoint deferred to phase 2. Chrome extension transformer action deferred to phase 2.**
- **Transformer default model:** Haiku 4.5 (cheap, fast, fits the template-filling workload). Overridable via `--model`.
- **Headless Claude strategy:** standalone CLI **auto-detects** `claude` on `$PATH`. If present, uses `claude -p`. If not, falls back to Anthropic API with a user-provided key stored in `~/.config/psl/config.json`. Explicit `--backend claude-code|api` flag available for override.
- **Plugin distribution:** Claude Code plugin marketplace (`/plugin add psl`). First activation in a repo with no PSL.md prompts the user to run `/psl init`.
- **Existing `psl-init` behavior:** preserved exactly. It moves into `packages/init/` as a straight relocation and is refactored to import from `@psl/core` rather than carrying its own parser — but CLI surface, flags, and output format stay identical so existing `npx psl-init` users aren't broken.

---

## Phasing (suggested for the plan)

**Phase 1 — Backbone + plugin (the wow moment):**
1. Extract `@psl/core` from current `psl-init` sources; add browser-safe build output.
2. Relocate `psl-init` into `packages/init`; switch it to use `@psl/core`; verify no behavior change.
3. Build `@psl/plugin`: skill, slash commands, MCP server wrapping `@psl/core`.
4. Publish to plugin marketplace.

**Phase 2 — Transformer + extension:**
5. Build `@psl/ticket` logic (system prompt, conversation flow, output contract) and surface it as both the `/psl ticket` slash command and the `npx psl-ticket` standalone CLI with auto-detected backend.
6. Build `@psl/chrome` MV3 extension: URL-list loader, GitHub auto-detect, `{`-trigger autocomplete, hover tooltips via `resolveDetailed()`. **No transformer action in v1.**

**Phase 3 — Later (after real usage data):**
7. Chrome extension right-click transformer action (requires the auth model decision — revisit with usage data).
8. Hosted web endpoint for the transformer (if demand exists; decide gating model at that time).
9. Optional plugin hooks for commit-message / PR-body token validation (opt-in).
10. Ticket-tracker integrations (Jira / Linear) in the transformer.

---

## Open Questions

These remain genuinely unresolved and should be answered during planning (they require looking at current Claude Code plugin marketplace norms or deciding UX details we don't need to lock now):

1. **Skill auto-load trigger:** what description should the skill's frontmatter carry so it auto-activates *only* when `PSL.md` is present, not on every unrelated repo? Worth checking how similar "file-presence-gated" skills do this in the plugin ecosystem today. The `/ce:plan` phase should sample 2–3 existing marketplace plugins to see the pattern.
2. **MCP server install path:** the plugin ships an MCP server, but MCP servers need a runtime. How do we handle the first-run where the user has Claude Code but not Node? Options: bundle a small binary (Bun compile / `pkg`), depend on Node being present, or implement the server in a different stack. Need to check current Claude Code plugin marketplace conventions before committing.
3. **Versioning and spec-version checks:** the plugin should warn when `<!-- psl: vX.Y.Z -->` in the repo's `PSL.md` is ahead of what `@psl/core` understands. Where in the flow does this warning surface — on skill load, on every MCP call, or only in `/psl validate`?

---

## Resolved Questions

- **Transformer model default:** Haiku 4.5 (cheap, fast, template-filling workload). Overridable via `--model`.
- **Multi-PSL disambiguation in Chrome extension:** global merged autocomplete; product prefix IS the namespace. Zero per-domain config.
- **`npx psl-ticket` backend detection:** auto-detect `claude` on `$PATH`; prefer headless Claude Code, fall back to Anthropic API with key in `~/.config/psl/config.json`. Explicit `--backend` flag to override.
- **`@psl/core` API surface:** two functions — `resolve()` returns string, `resolveDetailed()` returns rich object.
- **Chrome extension auth model:** not applicable in v1. Extension ships without the transformer action, so no API key handling, no OAuth. Revisit in phase 2 when the transformer action is added.

---

## Explicitly Out of Scope (v1)

- Hooks that validate commits / PRs (deferred until passive flow is proven).
- Jira / Linear / GitHub Issues API integrations for the transformer.
- A hosted PSL registry or discovery service.
- The hosted `psl.dev/ticket` web endpoint.
- **Chrome extension transformer action** (right-click "PSL-ify this ticket"). v1 extension ships autocomplete + hover tooltips only, no Anthropic API key handling.
- A `psl-ticket` sub-agent packaged inside the plugin — the slash command already covers the in-Claude-Code path.
- Non-Chromium browser support for the extension.

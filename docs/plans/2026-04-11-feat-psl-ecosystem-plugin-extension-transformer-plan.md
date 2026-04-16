---
title: "feat: PSL Ecosystem — Plugin, Chrome Extension, Transformer"
type: feat
status: completed
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-psl-ecosystem-brainstorm.md
---

# feat: PSL Ecosystem — Plugin, Chrome Extension, Transformer

## Overview

Build a monorepo of five packages sharing a pure-TypeScript core library that turns PSL from a markdown naming convention into an integrated tool ecosystem. The first user is a solo developer running Claude Code in their own repo; the wow moment is `/plugin add psl` → Claude offers to scan the codebase → draft `PSL.md` appears → Claude immediately uses canonical vocabulary in code and commits.

Three new surfaces beyond the existing `psl-init` CLI:

1. **`@psl/plugin`** — Claude Code plugin (skill + slash commands + local MCP server)
2. **`@psl/chrome`** — Chrome MV3 extension (autocomplete + hover tooltips in web tools)
3. **`@psl/ticket`** — Promptable ticket generator (slash command + standalone CLI)

All share **`@psl/core`** — a browser-safe TypeScript library for parsing, resolution, validation, search, and canonicalization.

## Problem Statement / Motivation

PSL defines a canonical vocabulary in a `PSL.md` file so humans, ticket systems, and AI agents use the same words. Today it has zero users. The CLI generates a draft vocabulary, but there is no tooling that *uses* the vocabulary once it exists — no autocomplete, no alias resolution, no validation, no integration with the tools where teams actually work (Claude Code, Jira, Slack, GitHub).

The gap between "convention exists in a file" and "convention is actively used" is the adoption barrier. This plan closes that gap by building the surfaces where PSL tokens are produced and consumed.

(see brainstorm: docs/brainstorms/2026-04-11-psl-ecosystem-brainstorm.md)

## Proposed Solution

### Architecture

```
psl/                          # monorepo root
  packages/
    core/                     # @psl/core — parse, resolve, validate, search, canonicalize
      src/
        parser.ts             # PSL.md string → PslVocabulary
        resolver.ts           # resolve() and resolveDetailed()
        validator.ts          # token syntax + vocabulary validation
        searcher.ts           # fuzzy search across loaded vocabulary
        canonicalizer.ts      # replace aliases in text with canonical names
        types.ts              # shared interfaces
        index.ts              # public API barrel
      package.json            # zero Node-only deps, dual ESM/CJS build
      tsconfig.json
    init/                     # @psl/init — existing psl-init CLI, relocated
      src/
        scanner.ts            # unchanged from current cli/src/scanner.ts
        analyzer.ts           # unchanged from current cli/src/analyzer.ts
        generator.ts          # unchanged from current cli/src/generator.ts
        index.ts              # CLI entry point (commander)
      package.json            # depends on @psl/core, commander, ignore
    plugin/                   # @psl/plugin — Claude Code plugin
      .claude-plugin/
        plugin.json           # manifest: { name: "psl", version, description }
      skills/
        psl-guide/
          SKILL.md            # auto-loads when PSL.md present (paths: "**/PSL.md")
        init/
          SKILL.md            # /psl:init slash command
        lookup/
          SKILL.md            # /psl:lookup slash command
        validate/
          SKILL.md            # /psl:validate slash command
        ticket/
          SKILL.md            # /psl:ticket slash command (context: fork)
      server/
        src/
          index.ts            # MCP server entry (stdio transport)
          tools.ts            # 4 tool definitions
        package.json          # depends on @psl/core, @modelcontextprotocol/sdk, zod
        tsconfig.json
      .mcp.json               # MCP server config for Claude Code
    chrome/                   # @psl/chrome — Chrome MV3 extension
      manifest.json           # MV3 manifest
      src/
        background.ts         # service worker: fetch/cache PSL files, alarms
        content.ts            # content script: autocomplete + hover tooltips
        options.ts            # options page: URL list management
        dropdown.ts           # Shadow DOM autocomplete dropdown
        tooltip.ts            # Shadow DOM hover tooltip
        github-detect.ts      # GitHub repo PSL.md auto-detection
      popup/
        popup.html            # extension popup (active PSLs summary)
      options/
        options.html          # options page
      package.json            # depends on @psl/core, fuzzysort
    ticket/                   # @psl/ticket — promptable ticket generator
      src/
        prompt.ts             # system prompt template (versioned)
        protocol.ts           # conversation flow logic
        backends/
          claude-code.ts      # headless claude -p invocation
          anthropic-api.ts    # direct Anthropic SDK
        config.ts             # ~/.config/psl/config.json management
        index.ts              # CLI entry point
      package.json            # depends on @psl/core, @anthropic-ai/sdk, commander
  package.json                # workspace root
  tsconfig.base.json          # shared TS config
  PSL.md                      # self-hosted example
```

### `@psl/core` Type Definitions

These interfaces are the contract all five packages depend on. Defined first, implemented first, tested first.

```typescript
// packages/core/src/types.ts

/** A parsed PSL vocabulary from a PSL.md file */
export interface PslVocabulary {
  productName: string;
  specVersion: string;                    // e.g. "1.0.0"
  sections: PslSection[];
  aliases: Map<string, string>;           // alias → canonical
  tokens: Map<string, PslToken>;          // canonical name → token
  warnings: PslWarning[];                 // non-fatal parse issues
}

export interface PslSection {
  type: 'areas' | 'concerns' | 'qualities' | 'aliases' | 'custom';
  heading: string;                        // raw heading text
  tokens: PslToken[];
}

export interface PslToken {
  canonical: string;                      // kebab-case canonical name
  aliases: string[];                      // recognized aliases
  description?: string;                   // text after em-dash
  children: PslToken[];                   // nested sub-tokens
  section: 'areas' | 'concerns' | 'qualities' | 'custom';
  line: number;                           // source line in PSL.md
}

export interface PslWarning {
  message: string;
  line?: number;
  code: 'unknown_version' | 'malformed_alias' | 'invalid_token_name'
      | 'alias_conflict' | 'alias_chain' | 'yaml_parse_error'
      | 'missing_header' | 'missing_version';
}

/** Result of resolve() — thin, for MCP tool responses */
export type ResolveResult =
  | { found: true; canonical: string }
  | { found: false; suggestions: string[] };

/** Result of resolveDetailed() — rich, for tooltips and lookup */
export interface ResolveDetailedResult {
  found: boolean;
  canonical: string;
  path: string[];                         // [product, area, concern, ...]
  aliases: string[];
  matchedVia: 'canonical' | 'alias' | 'not_found';
  description?: string;
  section?: string;
  children: string[];
}

/** Result of validate() */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  message: string;
  token: string;
  line?: number;
  code: 'syntax' | 'unknown_segment' | 'unknown_product';
}

/** Result of search() */
export interface SearchResult {
  canonical: string;
  score: number;                          // 0-1, higher is better
  matchedVia: 'canonical' | 'alias' | 'description';
  product: string;
  fullToken: string;                      // e.g. "{myapp.dashboard}"
  description?: string;
}
```

### `@psl/core` Public API

```typescript
// packages/core/src/index.ts

/** Parse a PSL.md string into structured vocabulary */
export function parse(content: string): PslVocabulary;

/** Resolve a term to its canonical name (thin) */
export function resolve(term: string, vocab: PslVocabulary): ResolveResult;

/** Resolve a term with full metadata (rich) */
export function resolveDetailed(term: string, vocab: PslVocabulary): ResolveDetailedResult;

/** Validate a PSL token string against the spec regex and optionally against a vocabulary */
export function validate(token: string, vocab?: PslVocabulary): ValidationResult;

/** Fuzzy search across a vocabulary */
export function search(query: string, vocab: PslVocabulary, limit?: number): SearchResult[];

/** Replace all alias occurrences in text with canonical names */
export function canonicalize(text: string, vocab: PslVocabulary): {
  text: string;
  replacements: { original: string; canonical: string; position: number }[];
};

/** Merge multiple vocabularies (for Chrome extension multi-PSL) */
export function merge(vocabs: PslVocabulary[]): PslVocabulary;
```

### MCP Server Tool Definitions

```typescript
// packages/plugin/server/src/tools.ts — tool schemas (Zod)

// psl_resolve_alias
// Input:  { term: string }
// Output: { canonical: string } | { error: "not_found", suggestions: string[] }

// psl_validate_token
// Input:  { token: string }
// Output: { valid: boolean, errors: string[], canonical?: string }

// psl_search_vocab
// Input:  { query: string, limit?: number }
// Output: { results: { canonical: string, type: string, aliases: string[], token: string }[] }

// psl_canonicalize
// Input:  { text: string }
// Output: { canonicalized: string, replacements: { original: string, canonical: string }[] }
```

The MCP server watches `PSL.md` with `fs.watch()` (debounced 500ms) and re-parses on change so edits are reflected immediately without restarting Claude Code.

### Plugin Skill Frontmatter

```yaml
# skills/psl-guide/SKILL.md
---
name: psl-guide
description: >
  PSL vocabulary and naming conventions. Activates when PSL.md is present.
  Teaches canonical product vocabulary, alias resolution, and token syntax.
paths: "**/PSL.md"
---
```

```yaml
# skills/ticket/SKILL.md
---
name: ticket
description: Generate a PSL-tagged ticket from natural language
disable-model-invocation: true
argument-hint: "<description of what to build or fix>"
context: fork
---
```

### Chrome Extension Content Script Strategy

Content scripts inject on target domains. The `{` character triggers autocomplete; detected PSL tokens get hover tooltips.

**v1 editor support matrix:**

| Site | Editor Type | v1 Support | Strategy |
|------|-------------|------------|----------|
| GitHub | Standard `<textarea>` | Full | `input` event on textarea |
| Jira Cloud | ProseMirror (contenteditable) | Best effort | `input` event on `[contenteditable]`, `getSelection()` for caret |
| Linear | Tiptap (contenteditable) | Best effort | Same as Jira |
| Slack web | Custom Quill-like editor | Best effort | `input` event on `.ql-editor` |
| Any site | Plain `<textarea>` | Full | `input` event |

Autocomplete dropdown renders in a **Shadow DOM** to prevent host CSS bleed. Fuzzy matching via **fuzzysort** (~2KB, zero deps). Cursor position via `getSelection().getRangeAt(0).getBoundingClientRect()` for contenteditable, **caret-pos** library for plain textareas.

Keyboard capture in the capture phase: ArrowUp/Down, Enter, Escape intercepted only while dropdown is open.

### Ticket Generator Backend Detection

```
npx psl-ticket "home page is slow"
  │
  ├─ Check $PATH for `claude`
  │   ├─ Found → spawn `claude -p` with system prompt + PSL.md
  │   │          (verify auth: if claude -p fails, fall through)
  │   └─ Not found → continue
  │
  ├─ Check ~/.config/psl/config.json for anthropicApiKey
  │   ├─ Found → use @anthropic-ai/sdk with Haiku 4.5
  │   └─ Not found → continue
  │
  └─ Print error:
     "No LLM backend available.
      Option 1: Install Claude Code (claude.ai/code)
      Option 2: Run `npx psl-ticket --setup` to configure an Anthropic API key"
```

Explicit `--backend claude-code|api` flag overrides auto-detection. `--model` overrides default Haiku 4.5.

## Technical Approach

### Implementation Phases

#### Phase 1: Foundation — `@psl/core` + Monorepo Setup

**Goal:** Extract the shared core library, set up monorepo, relocate `psl-init`.

**Tasks:**

1. **Set up monorepo workspace**
   - `package.json` at root with npm workspaces pointing to `packages/*`
   - `tsconfig.base.json` with shared compiler options (strict, ESM target)
   - Per-package `tsconfig.json` extending base

2. **Implement `@psl/core`** (the new code — PSL.md parsing + runtime)
   - `packages/core/src/types.ts` — all interfaces from the API section above
   - `packages/core/src/parser.ts` — parse PSL.md markdown string into `PslVocabulary`
     - Parse H1 for product name
     - Parse `<!-- psl: vX.Y.Z -->` for spec version (warn if missing or unknown)
     - Parse `## Areas`, `## Concerns`, `## Qualities` sections → tokens with aliases, children, descriptions
     - Parse `## Aliases` YAML block → merge with inline `(aka: ...)` annotations; YAML wins on conflict
     - Unknown sections (like `## Map`, `## How to Use` from the generator) → silently ignored per spec
     - Return `warnings[]` for non-fatal issues (never throw on parse)
   - `packages/core/src/resolver.ts` — `resolve()` and `resolveDetailed()`
     - Lookup by canonical name first, then aliases
     - `resolve()` returns `{ found, canonical }` or `{ found: false, suggestions }` via fuzzy fallback
     - `resolveDetailed()` returns full metadata including path, aliases, section, children
   - `packages/core/src/validator.ts` — `validate()`
     - Regex check against spec pattern: `^\{[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*\}$`
     - If vocabulary provided: check each segment exists as a known token
     - Return structured `ValidationResult` with error codes and line numbers
   - `packages/core/src/searcher.ts` — `search()`
     - Fuzzy match across canonical names, aliases, and descriptions
     - Use a lightweight scoring algorithm (prefix match > substring > fuzzy distance)
     - No external dependency — keep core dependency-free for browser bundling
     - `limit` parameter (default 10)
   - `packages/core/src/canonicalizer.ts` — `canonicalize()`
     - Find all `{...}` tokens in input text
     - For each, resolve aliases → replace with canonical form
     - Return transformed text + replacement list with positions
   - `packages/core/src/index.ts` — barrel export of public API
   - **Build config:** tsup with dual ESM/CJS output, no Node-only imports, `"browser"` field in package.json

3. **Relocate `psl-init` into `packages/init/`**
   - Move `cli/src/*` → `packages/init/src/*` (scanner, analyzer, generator, index)
   - Update `packages/init/package.json` to depend on `@psl/core`
   - Refactor `generator.ts` to import `toKebab` and shared types from `@psl/core` instead of local `analyzer.ts`
   - Keep analyzer.ts and scanner.ts in `packages/init/` (they use `node:fs`, not browser-safe)
   - Verify: `npx psl-init` produces identical output before and after relocation

4. **Round-trip test**
   - Generate a PSL.md from the existing generator
   - Feed it to `@psl/core` parser
   - Verify every generated area, concern, alias resolves correctly
   - Verify no warnings for generator-produced content (custom sections like `## Map` and `## How to Use` should be silently ignored)
   - This test catches format incompatibilities immediately

5. **Unit tests for `@psl/core`**
   - Parser: valid PSL.md, empty file, missing header, missing version, malformed YAML, alias conflicts, alias chains, nested children
   - Resolver: canonical lookup, alias lookup, not-found with suggestions, case sensitivity
   - Validator: valid tokens, invalid syntax (uppercase, standalone numbers, dots in segments), unknown segments
   - Searcher: prefix match, substring, fuzzy, empty query, limit
   - Canonicalizer: single replacement, multiple, nested tokens, no tokens, text without braces

**Deliverables:**
- Working monorepo with `@psl/core` and `@psl/init`
- `npx psl-init` works identically to before
- Full test suite for `@psl/core`
- Round-trip test passing

**Success criteria:**
- `@psl/core` has zero `node:` imports
- `@psl/core` bundles to < 20KB minified (no heavy deps)
- All existing `psl-init` behavior preserved (diff test against current output)

#### Phase 2: Claude Code Plugin — `@psl/plugin`

**Goal:** Ship the plugin to the Claude Code marketplace. Deliver the "wow moment."

**Tasks:**

1. **Plugin manifest and structure**
   - `packages/plugin/.claude-plugin/plugin.json`:
     ```json
     {
       "name": "psl",
       "version": "1.0.0",
       "description": "Product Spec Language — canonical vocabulary for your codebase",
       "author": { "name": "Elliot Nash" },
       "keywords": ["psl", "vocabulary", "naming", "specification"]
     }
     ```

2. **Skill: `psl-guide`** (auto-loading vocabulary awareness)
   - `skills/psl-guide/SKILL.md` with `paths: "**/PSL.md"` frontmatter
   - Body teaches Claude: what PSL is, how to read PSL.md, when to use canonical names, how to resolve aliases, when to suggest `/psl:init` if no PSL.md exists
   - Includes instructions to use MCP tools (`psl_resolve_alias`, etc.) when available

3. **Slash command: `/psl:init`**
   - `skills/init/SKILL.md` with `disable-model-invocation: true`
   - Wraps the existing `psl-init` scanner
   - Scans current repo root, writes `PSL.md`, reports areas found
   - If `PSL.md` already exists, asks user before overwriting

4. **Slash command: `/psl:lookup <term>`**
   - Calls `psl_resolve_alias` MCP tool and displays result
   - If not found, shows fuzzy suggestions from `psl_search_vocab`

5. **Slash command: `/psl:validate`**
   - Calls `psl_validate_token` for each token in PSL.md
   - Reports errors and warnings in a structured list
   - Also validates the PSL.md file structure itself

6. **Slash command: `/psl:ticket`**
   - `context: fork` (isolated subagent)
   - Invokes `@psl/ticket` conversation protocol in-session (no subprocess)
   - Reads PSL.md, asks clarifying questions, outputs markdown ticket + engineer prompt

7. **MCP server**
   - `packages/plugin/server/src/index.ts` using `@modelcontextprotocol/sdk`
   - Stdio transport (Claude Code spawns as child process)
   - 4 tools with Zod input schemas: `psl_resolve_alias`, `psl_validate_token`, `psl_search_vocab`, `psl_canonicalize`
   - On startup: find and parse `PSL.md` from repo root (walk up from cwd)
   - Watch `PSL.md` with `fs.watch()`, debounce 500ms, re-parse on change
   - If no `PSL.md` found: tools return helpful error messages ("No PSL.md found. Run `/psl:init` to create one.")
   - `.mcp.json` at plugin root:
     ```json
     {
       "mcpServers": {
         "psl": {
           "command": "node",
           "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/index.js"]
         }
       }
     }
     ```

8. **Build and publish**
   - Build MCP server with tsup
   - Test locally: install plugin from filesystem, verify skill loads, commands work, MCP tools respond
   - Publish to Claude Code plugin marketplace

**Deliverables:**
- Plugin installable via `/plugin add psl`
- 1 auto-loading skill, 4 slash commands, 4 MCP tools
- MCP server hot-reloads when PSL.md changes

**Success criteria:**
- In a repo with no PSL.md: first prompt triggers skill to suggest `/psl:init`
- After init: Claude uses canonical names from PSL.md in generated code
- `/psl:lookup home` resolves to `dashboard` (given the spec example)
- `/psl:validate` passes on a freshly generated PSL.md

#### Phase 3: Ticket Generator — `@psl/ticket`

**Goal:** Natural language → PSL-tagged ticket + engineer prompt.

**Tasks:**

1. **System prompt template** (`packages/ticket/src/prompt.ts`)
   - Versioned template, not inlined in code
   - Instructs the model to:
     - Read the provided PSL vocabulary
     - Ask 2-4 clarifying questions about scope, acceptance criteria, and affected areas
     - Map user's natural language to PSL tokens using the vocabulary
     - Output a markdown ticket section with PSL tokens + a separate engineer prompt section
   - Includes the PSL.md content as context
   - Includes the output format contract (the markdown template from the brainstorm)

2. **Conversation protocol** (`packages/ticket/src/protocol.ts`)
   - Single-shot for CLI: questions → output → exit
   - In-session for plugin: questions → output → done (user continues in Claude Code)
   - Max 4 clarifying questions, then generate
   - If user input is specific enough (contains PSL-like terms), skip to generation
   - Termination: print ticket, exit CLI / return control to plugin

3. **Backend: headless Claude Code** (`packages/ticket/src/backends/claude-code.ts`)
   - Detect `claude` on `$PATH`
   - Spawn: `claude -p "<system prompt + PSL.md + user input>" --output-format text`
   - Handle auth failure (claude not logged in): fall through to API backend
   - Stream output to stdout

4. **Backend: Anthropic API** (`packages/ticket/src/backends/anthropic-api.ts`)
   - Use `@anthropic-ai/sdk`
   - Default model: `claude-haiku-4-5-20251001` (Haiku 4.5)
   - Read API key from `~/.config/psl/config.json`
   - `--setup` command: interactive prompt for API key, writes config file with `0600` permissions

5. **CLI entry point** (`packages/ticket/src/index.ts`)
   - `npx psl-ticket "<description>"` — main flow
   - `npx psl-ticket --setup` — configure API key
   - `npx psl-ticket --backend claude-code|api` — override auto-detection
   - `npx psl-ticket --model <model-id>` — override default model
   - `npx psl-ticket --psl <path>` — explicit PSL.md path
   - Default PSL.md discovery: search upward from cwd for `PSL.md`
   - If no PSL.md found: generate ticket without token validation, print warning

6. **Plugin slash command integration**
   - `/psl:ticket` skill body loads the same system prompt template
   - Runs in-session (no subprocess) — Claude IS the LLM, no need for headless invocation
   - Reads PSL.md via MCP tool or direct file read

**Deliverables:**
- `npx psl-ticket "home page is slow"` produces a PSL-tagged ticket
- `/psl:ticket "home page is slow"` works identically in Claude Code
- `--setup` flow for API key configuration
- Auto-detection of claude vs. API backend

**Success criteria:**
- Output matches the format contract from brainstorm (ticket section + engineer prompt section)
- PSL tokens in output are valid per vocabulary
- Graceful degradation when no PSL.md exists (warning, not error)
- Clear error message when no backend is available

#### Phase 4: Chrome Extension — `@psl/chrome`

**Goal:** PSL token autocomplete and hover tooltips in web tools.

**Tasks:**

1. **Manifest V3 setup** (`packages/chrome/manifest.json`)
   ```json
   {
     "manifest_version": 3,
     "name": "PSL — Product Spec Language",
     "version": "1.0.0",
     "description": "Autocomplete PSL tokens in Jira, Linear, Slack, GitHub",
     "permissions": ["storage", "alarms"],
     "host_permissions": ["https://raw.githubusercontent.com/*"],
     "background": { "service_worker": "background.js" },
     "content_scripts": [{
       "matches": [
         "https://*.atlassian.net/*",
         "https://linear.app/*",
         "https://app.slack.com/*",
         "https://github.com/*"
       ],
       "js": ["content.js"],
       "run_at": "document_idle"
     }],
     "options_page": "options/options.html",
     "action": { "default_popup": "popup/popup.html" }
   }
   ```

2. **Service worker** (`packages/chrome/src/background.ts`)
   - Fetch PSL.md from configured URLs (bypasses CORS via `host_permissions`)
   - Parse with `@psl/core` `parse()`, cache parsed `PslVocabulary` in `chrome.storage.local`
   - Store ETag per URL; use conditional `GET` with `If-None-Match` on refresh
   - `chrome.alarms.create('refreshPSL', { periodInMinutes: 60 })` — hourly refresh
   - Manual refresh via message from options page
   - Handle 404: keep stale cache, badge warning icon
   - Handle parse errors: store warning in `chrome.storage.local`, surface in options page

3. **Options page** (`packages/chrome/src/options.ts`)
   - URL list: add, remove, reorder PSL sources
   - Each entry shows: product name (from parsed PSL), source URL, last fetched timestamp
   - "Add from URL" input + "Paste raw PSL.md" textarea
   - "Refresh now" button
   - GitHub auto-detect toggle (default: on)
   - Display parse warnings/errors per source
   - Store settings in `chrome.storage.sync` (syncs across devices)
   - Store cached PSL data in `chrome.storage.local` (per-device)

4. **GitHub auto-detect** (`packages/chrome/src/github-detect.ts`)
   - Content script on `github.com/*` pages
   - Match URL: `/^\/([^/]+)\/([^/]+)/` → owner, repo
   - HEAD request to `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/PSL.md`
   - If 200: check if already in user's URL list; if not, show subtle banner: "PSL.md detected for this repo — add it?"
   - User clicks "Add" → URL added to list, PSL fetched and cached
   - Dismissed repos stored in `chrome.storage.sync` to avoid re-prompting

5. **Autocomplete dropdown** (`packages/chrome/src/dropdown.ts`)
   - Render in Shadow DOM (closed mode) with `all: initial` and `z-index: 2147483647`
   - Position: anchored to cursor position
     - Plain textarea: use caret-pos library for xy coords
     - contenteditable: `getSelection().getRangeAt(0).getBoundingClientRect()`
   - Trigger: detect `{` character in input event
   - Fuzzy matching: fuzzysort against merged vocabulary from all loaded PSLs
   - Display: token name, product prefix, section type, alias matches highlighted
   - Keyboard: ArrowUp/Down to navigate, Enter to select, Escape to dismiss, Tab to complete
   - Capture phase listeners, `stopPropagation` + `preventDefault` only while dropdown open
   - On selection: insert full token `{product.area.concern}` replacing text from `{` to cursor
   - Max 8 results displayed

6. **Hover tooltips** (`packages/chrome/src/tooltip.ts`)
   - Scan visible text nodes for PSL token pattern: `\{[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*\}`
   - Wrap detected tokens in a `<span>` with mouseover listener
   - On hover: call `resolveDetailed()` from `@psl/core`, display tooltip in Shadow DOM
   - Tooltip shows: canonical name, aliases, description, section, children
   - Debounce: 200ms hover delay before showing tooltip
   - Re-scan on MutationObserver events (new content loaded in SPA)

7. **Content script orchestration** (`packages/chrome/src/content.ts`)
   - Entry point: initialize MutationObserver on `document.body`
   - Detect textareas, contenteditable elements, known editor classes
   - Attach autocomplete listeners
   - Attach hover tooltip scanning
   - Request cached PSL data from service worker on init
   - Listen for cache updates (new PSL added/refreshed) via `chrome.runtime.onMessage`

8. **Build and publish**
   - Bundle with tsup/vite targeting Chrome MV3
   - `@psl/core` tree-shaken into the content script bundle
   - Test locally: load unpacked, verify autocomplete on GitHub textarea, hover tooltip on existing tokens
   - Publish to Chrome Web Store

**Deliverables:**
- Extension on Chrome Web Store
- Autocomplete on `{` trigger in textareas on GitHub, Jira, Linear, Slack
- Hover tooltips on PSL tokens
- Options page with URL management + GitHub auto-detect

**Success criteria:**
- Type `{dash` in a GitHub comment textarea → autocomplete suggests `dashboard`
- Hover over `{myapp.dashboard}` in a Jira ticket → tooltip shows aliases and description
- Add a new PSL URL in options → autocomplete includes new vocabulary within seconds
- Extension bundle < 100KB total

## System-Wide Impact

### Interaction Graph

Plugin skill loads → MCP server starts → tools become available to Claude. When user edits PSL.md → `fs.watch` fires → MCP server re-parses → next tool call uses updated vocabulary. Chrome extension fetch alarm fires → service worker fetches URLs → parses → writes to `chrome.storage.local` → content script receives update message → autocomplete vocabulary updated.

### Error & Failure Propagation

- `@psl/core` `parse()` never throws — returns `PslVocabulary` with `warnings[]` for any issues
- MCP tools return structured errors with suggestions, not exceptions
- Chrome extension: fetch failure → stale cache used → warning badge on icon
- `psl-ticket`: backend failure → fall through to next backend → final error message with recovery steps

### State Lifecycle Risks

- PSL.md is the only persistent state; it lives in git. No databases, no remote state.
- Chrome extension cache in `chrome.storage.local` is advisory — always re-derivable from URLs
- `~/.config/psl/config.json` stores only the API key — worst case, user re-runs `--setup`
- MCP server is stateless between requests (re-reads PSL.md or cached parse on each call)

### API Surface Parity

All four MCP tools have direct equivalents in `@psl/core`: `resolve()`, `validate()`, `search()`, `canonicalize()`. The Chrome extension uses the same functions. The ticket generator uses `parse()` + `validate()`. No surface has exclusive functionality — `@psl/core` is the single source of truth.

### Integration Test Scenarios

1. **Generator → Parser round-trip:** `psl-init` generates PSL.md → `@psl/core` parses it → all tokens resolve → validate passes with no errors
2. **Alias consistency:** Define alias in YAML block AND inline `(aka: ...)` → both resolve to same canonical → mismatch produces warning
3. **MCP hot-reload:** Edit PSL.md (add new area) → within 1s, MCP tool `psl_search_vocab` returns the new area
4. **Chrome multi-PSL merge:** Load 2 PSLs with different product names → autocomplete shows both → product prefix disambiguates
5. **Ticket generator with empty vocabulary:** Run `psl-ticket` in a repo with no PSL.md → warning printed, ticket still generated without token validation

## Acceptance Criteria

### Functional Requirements

- [x] `@psl/core` parses valid PSL.md files conforming to SPEC.md v1.0.0
- [x] `@psl/core` bundles for browser (zero `node:` imports) and Node
- [x] `npx psl-init` produces identical output after monorepo relocation
- [x] Plugin installs via marketplace and activates when PSL.md is present
- [x] Plugin MCP server exposes 4 working tools over stdio
- [x] `/psl:init` scans codebase and creates PSL.md
- [x] `/psl:lookup <term>` resolves aliases and shows suggestions
- [x] `/psl:validate` reports token validity
- [x] `/psl:ticket` asks questions and produces markdown ticket + engineer prompt
- [x] `npx psl-ticket` works with auto-detected backend
- [x] Chrome extension shows autocomplete dropdown on `{` trigger
- [x] Chrome extension shows hover tooltips on PSL tokens
- [x] Chrome extension options page manages PSL source URLs
- [x] Chrome extension auto-detects PSL.md on GitHub repo pages

### Non-Functional Requirements

- [x] `@psl/core` bundle < 20KB minified (actual: 13.73 KB ESM)
- [x] Chrome extension total bundle < 100KB (actual: ~19 KB JS)
- [ ] Autocomplete dropdown appears within 50ms of `{` keypress (needs manual test)
- [ ] MCP server responds to tool calls within 10ms (after initial parse) (needs manual test)
- [ ] `fs.watch` re-parse completes within 100ms of PSL.md save (needs manual test)
- [x] No `eval()` or dynamic code generation in any package (Chrome MV3 CSP compliance)

### Quality Gates

- [x] Unit tests for all `@psl/core` public functions (parser, resolver, validator, searcher, canonicalizer) — 42 tests passing
- [x] Round-trip test: generator → parser → validator
- [x] Integration test: MCP server start → tool call → correct response (smoke tested)
- [ ] Manual test: Chrome extension on GitHub, Jira, Linear, Slack (needs manual test)
- [x] `psl-init` diff test: output unchanged from pre-monorepo version

## Alternative Approaches Considered

1. **Skill-only plugin (no MCP server):** Rejected because Claude re-parsing PSL.md markdown on every turn is unreliable — an MCP tool call gives deterministic resolution. (see brainstorm: Brainstorm Q2 — Plugin shape)

2. **Central hosted registry:** Rejected because it adds ops cost, abuse surface, and moderation for zero users. File-based, no service. (see brainstorm: Key Decision — Architecture)

3. **Duplicated parsing per artifact:** Rejected because PSL's value IS consistency. A regex fix in one artifact must propagate to all. Shared `@psl/core` is non-negotiable. (see brainstorm: Key Decision — Shared backbone)

4. **Chrome extension with transformer action in v1:** Rejected because it requires API key handling in the extension, adding auth complexity and security surface for a zero-user product. Deferred to phase 2. (see brainstorm: Resolved Question — Extension auth)

5. **Hooks for commit validation in v1:** Rejected because enforcement is opinionated and potentially scary for new users. The passive flow (skill + MCP tools) should be proven first. (see brainstorm: Key Decision — No hooks in v1)

## Dependencies & Prerequisites

- **Node.js >= 18** — required for MCP server, `psl-init` CLI, `psl-ticket` CLI
- **`@modelcontextprotocol/sdk`** — MCP server framework (stdio transport)
- **`@anthropic-ai/sdk`** — Anthropic API backend for `psl-ticket`
- **`fuzzysort`** — fuzzy matching in Chrome extension (~2KB, zero deps)
- **`caret-pos`** — textarea cursor position for Chrome extension (~1KB)
- **`commander`** — CLI argument parsing (already a dependency)
- **`zod`** — MCP tool schema validation
- **`tsup`** — build tool for all packages
- **Chrome Web Store developer account** — for extension publishing
- **Claude Code plugin marketplace access** — for plugin publishing

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Custom editor injection breaks on Jira/Linear/Slack DOM changes | High | Medium | Shadow DOM isolation; MutationObserver re-scanning; document known-broken editors; explicit "best effort" scope for v1 |
| Claude Code plugin marketplace norms change | Low | High | Plugin structure follows current docs exactly; manifest is minimal |
| `@psl/core` parser doesn't handle edge cases in real-world PSL.md files | Medium | High | Extensive unit tests; parser never throws (returns warnings); round-trip test with generator |
| MCP server fails to start (Node not found, port conflict) | Medium | Medium | Stdio transport (no port); require Node; clear error message on startup failure |
| Zero users even after shipping | High | Low | The plugin is the first-user funnel; Chrome extension and ticket CLI are phase 2+ growth plays. Ship plugin fast, iterate based on feedback |

## Future Considerations (Phase 2+)

- Chrome extension right-click "PSL-ify this ticket" action (requires auth model decision)
- Hosted web endpoint at `psl.dev/ticket` (requires ops, gating model)
- Jira/Linear API integrations for ticket generator
- Plugin hooks for commit/PR token validation (opt-in)
- `psl-init --merge` for updating PSL.md without losing manual edits
- `/psl:add-area <name>` incremental command
- Private GitHub repo support in Chrome extension (via PAT)
- Non-Chromium browser extension (Firefox MV3)
- PSL.md Language Server Protocol for IDE integration

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-11-psl-ecosystem-brainstorm.md](docs/brainstorms/2026-04-11-psl-ecosystem-brainstorm.md) — Key decisions carried forward: shared `@psl/core` TS library in monorepo, plugin marketplace distribution with skill auto-load, Chrome extension autocomplete-only v1, ticket generator with Haiku 4.5 and auto-detected backend.

### Internal References

- PSL Specification v1.0.0: `SPEC.md`
- Existing CLI entry: `cli/src/index.ts`
- Existing scanner (Node-dependent, stays in `@psl/init`): `cli/src/scanner.ts`
- Existing analyzer (Node-dependent, stays in `@psl/init`): `cli/src/analyzer.ts`
- Existing generator: `cli/src/generator.ts`

### External References

- [Claude Code Plugin Docs](https://code.claude.com/docs/en/plugins) — plugin structure, manifest, skill activation
- [Claude Code Skills Docs](https://code.claude.com/docs/en/skills) — skill frontmatter, `paths` field for file-presence gating
- [Claude Code Plugin Reference](https://code.claude.com/docs/en/plugins-reference) — plugin.json schema, `.mcp.json` format
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — `McpServer`, `StdioServerTransport`, Zod tool schemas
- [Chrome MV3 Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — injection patterns, matches
- [fuzzysort](https://github.com/farzher/fuzzysort) — lightweight fuzzy matching library
- [caret-pos](https://github.com/nicosa/caret-pos) — textarea cursor position detection

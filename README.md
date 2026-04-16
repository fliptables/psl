# PSL — Product Spec Language

A naming convention for how to talk about products and software.

PSL defines canonical vocabulary in a Markdown file (`PSL.md`) at the root of any repository, so humans writing tickets, engineers naming things, and AI agents generating code all use the same words.

## Quick Start

Create `PSL.md` at your repo root:

```markdown
# PSL: myapp
<!-- psl: v1.0.0 -->

## Areas
- **dashboard** (aka: home, main-view)
  - stats, activity-feed, header
- **settings** (aka: preferences, config)
  - profile, billing, notifications

## Concerns
- **performance** (aka: perf, speed)
- **visual** (aka: ui, design)
- **crash** (aka: exc, fatal)

## Qualities
- **responsive** — interactions complete within one frame
- **accessible** — meets WCAG 2.1 AA
```

Or generate one automatically:

```bash
npx psl-init
```

Then use PSL tokens everywhere — tickets, PRs, commits, agent prompts:

```
{myapp.dashboard.performance.activity-feed}
{myapp.settings.visual}
{myapp.crash}
```

## Why PSL?

A designer says "home screen." An engineer says "dashboard view." A PM writes "main page." An AI agent generates code referencing "landing panel." Same product, four vocabularies.

PSL fixes this with a single file that canonicalizes your product's vocabulary. Each term has one canonical name, optional aliases for recognition, and a clear hierarchy.

## The Convention

Dot-separated segments in braces:

```
{product.area.concern.specific}
```

- **Product** — your app name (`myapp`)
- **Area** — where in the product (`dashboard`, `settings`)
- **Concern** — what kind of issue (`performance`, `visual`, `crash`)
- **Specific** — narrow it further as needed (`drag-resize`, `activity-feed`)

Stop at whatever depth is specific enough. `{myapp.dashboard}` is as valid as `{myapp.dashboard.performance.activity-feed}`.

## Token Rules

Valid tokens match: `{[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*}`

- Product name: lowercase alphanumeric, no hyphens
- Other segments: kebab-case
- Dots separate segments — no dots within segments
- No standalone numbers (`tab-2` not `2`)

## Aliases

Each token can have aliases that resolve to the canonical name:

```markdown
- **inspector** (aka: right-sidebar, trailing-sidebar)
```

`{myapp.right-sidebar}` resolves to `{myapp.inspector}`. One direction, no chains.

For reliable machine parsing, include a YAML alias block:

````markdown
## Aliases

```yaml
inspector: [right-sidebar, trailing-sidebar]
dashboard: [home, main-view]
```
````

## Ecosystem

PSL ships with tools that make the vocabulary actionable — not just a file sitting in your repo.

### Claude Code Plugin

Install the plugin and Claude learns your vocabulary automatically:

```bash
/plugin add psl
```

Once installed, when you open a repo with `PSL.md`, Claude will:
- Use canonical names in generated code and commits
- Resolve aliases when you use them in conversation
- Offer to run `/psl:init` if no `PSL.md` exists

**Slash commands:**

| Command | What it does |
|---------|-------------|
| `/psl:init` | Scan the codebase and generate a draft `PSL.md` |
| `/psl:lookup <term>` | Look up a term — resolve aliases, show metadata |
| `/psl:validate` | Check `PSL.md` for issues (invalid tokens, alias conflicts) |
| `/psl:ticket "<description>"` | Generate a PSL-tagged ticket from natural language |

**MCP tools** (available to Claude automatically):

- `psl_resolve_alias` — resolve any term to its canonical name with full metadata
- `psl_validate_token` — validate a token like `{myapp.dashboard.performance}`
- `psl_search_vocab` — fuzzy search the vocabulary
- `psl_canonicalize` — replace all aliases in text with canonical names
- `psl_list_vocab` — browse all vocabulary terms grouped by section

### Ticket Generator CLI

Turn plain English into PSL-tagged tickets from the command line:

```bash
npx psl-ticket "the sidebar is slow when there are lots of files" --psl ./PSL.md
```

Output:

```markdown
## Ticket: Improve sidebar performance with many files
Tokens: {myapp.sidebar.performance}

**Problem.** The sidebar becomes sluggish when rendering large file trees.

**Acceptance.** Sidebar renders within 200ms with 1,000+ files.

---

## Engineer prompt
> Fix {myapp.sidebar.performance} — the file tree takes >2s to render
> with large repos. Start with the tree virtualization in sidebar/*.
> Acceptance: renders within 200ms for 1,000+ files.
```

The ticket generator reads your `PSL.md` to resolve terms, pick the right tokens, and reference existing patterns in your codebase.

**Options:**

```bash
# Specify PSL.md location (otherwise searches up from cwd)
npx psl-ticket --psl ./PSL.md "description"

# Use Anthropic API directly instead of Claude Code
npx psl-ticket --backend api "description"

# Configure API key for the API backend
npx psl-ticket setup

# Override the default model (Haiku 4.5)
npx psl-ticket --model claude-sonnet-4-5-20250514 "description"
```

### Chrome Extension

Autocomplete PSL tokens in Jira, Linear, Slack, and GitHub. Type `{` in any textarea to trigger the dropdown.

**Install from source:**

```bash
cd packages/chrome
npm run build
```

Then load unpacked in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `packages/chrome/dist/`

**Features:**
- Type `{` in any textarea to autocomplete PSL tokens
- Hover over existing PSL tokens to see definitions, aliases, and children
- Manage PSL sources in the extension options page (add GitHub raw URLs)
- Auto-detects `PSL.md` when browsing GitHub repos

### Core Library

For building your own PSL tools:

```bash
npm install @psl/core
```

```typescript
import { parse, resolve, resolveDetailed, validate, search, canonicalize } from '@psl/core';

const vocab = parse(pslMarkdown);

resolve('perf', vocab);           // { found: true, canonical: 'performance' }
validate('{myapp.dashboard}', vocab); // { valid: true, errors: [] }
search('dash', vocab);            // [{ canonical: 'dashboard', score: 0.9, ... }]
canonicalize('Fix {myapp.perf}', vocab); // { text: 'Fix {myapp.performance}', ... }
```

`@psl/core` is browser-safe (zero Node dependencies) so it works in Chrome extensions, web apps, and Node CLIs.

## For AI Agents

Add this to your `CLAUDE.md`, `AGENTS.md`, or system prompt:

```markdown
## PSL Vocabulary
Canonical product vocabulary lives in PSL.md at the repo root.
When a user or spec refers to a PSL alias, resolve to the canonical
name before writing code, naming variables, or writing commit messages.
```

Or just install the Claude Code plugin (`/plugin add psl`) and it handles this automatically.

## Generating PSL.md

```bash
# Scan your codebase and generate a draft PSL.md
npx psl-init

# Specify a different project root
npx psl-init --path ./my-project
```

The generator scans directory structure, filenames, and existing docs to produce a draft. You'll want to edit it — the goal is 60-70% accuracy so editing is faster than writing from scratch.

## Development

This is a monorepo with npm workspaces:

```
packages/
  core/       # @psl/core — parser, resolver, validator, search (browser-safe)
  init/       # psl-init CLI — codebase scanner + PSL.md generator
  plugin/     # Claude Code plugin — skills, slash commands, MCP server
  chrome/     # Chrome MV3 extension — autocomplete + tooltips
  ticket/     # psl-ticket CLI — ticket generator
```

```bash
# Install dependencies
npm install

# Build all packages (core first, then the rest)
npm run build

# Run tests
npm test -w @psl/core
```

## FAQ

**Why Markdown?**
Agents parse it natively. Humans read it without learning a new format. It lives naturally alongside `CLAUDE.md` and `README.md`.

**Why braces?**
PSL tokens need to be recognizable inline in any context — Slack messages, ticket descriptions, commit messages, code comments. Braces make them visually distinct: "Fix the `{myapp.dashboard.performance}` regression."

**Why not YAML/JSON/TOML?**
PSL.md is meant to be read and edited by humans first. Markdown with an optional YAML alias block gives you both human readability and machine parseability.

**How is this different from DDD Ubiquitous Language?**
Same idea, but PSL lives in a file in your repo — machine-readable, version-controlled, and discoverable by AI agents. Ubiquitous Language lives in people's heads.

**How is this different from design tokens?**
Design tokens define visual properties (colors, spacing). PSL defines product concepts (areas, concerns, qualities). They complement each other.

**Do I need the CLI?**
No. You can write `PSL.md` by hand — it's just Markdown. The CLI is a convenience for bootstrapping.

## Specification

See [SPEC.md](SPEC.md) for the formal v1.0.0 specification.

## License

[MIT](LICENSE)

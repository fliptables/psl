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

## For AI Agents

Add this to your `CLAUDE.md`, `AGENTS.md`, or system prompt:

```markdown
## PSL Vocabulary
Canonical product vocabulary lives in PSL.md at the repo root.
When a user or spec refers to a PSL alias, resolve to the canonical
name before writing code, naming variables, or writing commit messages.
```

Agents should:
1. Read `PSL.md` to learn the product's vocabulary
2. Use canonical names (not aliases) in generated code
3. Reference PSL tokens in commit messages and PR descriptions when relevant

## Generating PSL.md

```bash
# Scan your codebase and generate a draft PSL.md
npx psl-init

# Specify a different project root
npx psl-init --path ./my-project

# Include git history analysis
npx psl-init --git
```

The generator scans directory structure, filenames, and existing docs to produce a draft. You'll want to edit it — the goal is 60-70% accuracy so editing is faster than writing from scratch.

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

## Examples

- [Scape (macOS app)](examples/scape.md)

## License

[MIT](LICENSE)

# Product Spec Language — Specification v1.0.0

## Summary

PSL is a naming convention for talking about products. It gives humans, ticket systems, and AI agents a shared vocabulary by defining canonical terms in a Markdown file (`PSL.md`) at the root of a repository.

## Convention

PSL references are dot-separated segments wrapped in braces:

```
{product.area.concern}
```

Examples:

- `{scape.inspector.performance.drag-resize}`
- `{scape.editor.visual}`
- `{scape.terminal.split.lifecycle.exit}`

Depth is flexible — stop at any level that's specific enough.

## Token Syntax

A valid PSL token matches:

```regex
^\{[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*\}$
```

Rules:

- First segment (product name): lowercase alphanumeric, no hyphens, no dots
- Subsequent segments: lowercase alphanumeric with hyphens (kebab-case)
- Dots are separators — segments cannot contain dots
- No standalone numbers (`{scape.editor.2}` is invalid; `{scape.editor.tab-2}` is valid)

## PSL.md Format

A valid `PSL.md` file has:

1. An H1 title: `# PSL: <product-name>`
2. A version comment: `<!-- psl: v1.0.0 -->`
3. At least one section

### Sections

| Section | Purpose | Describes |
|---------|---------|-----------|
| `## Areas` | Product regions, UI zones, modules | WHERE something is |
| `## Concerns` | Cross-cutting issue categories | WHAT kind of issue |
| `## Qualities` | Desired attributes, constraints | HOW it should behave |
| `## Aliases` | YAML block for machine parsing | Canonical → alias map |

Teams may add custom sections. The three core types are conventions, not requirements.

### Token Definition Syntax

```markdown
- **canonical-name** (aka: alias1, alias2) — optional description
  - child1, child2
    - grandchild1
```

- **Bold text** = canonical token name (kebab-case)
- **(aka: ...)** = optional aliases, comma-separated
- **— text** = optional description
- **Indented items** = children (sub-tokens), nestable to any depth

### Aliases Section

A fenced YAML block for reliable machine parsing:

````markdown
## Aliases

```yaml
inspector: [right-sidebar, trailing-sidebar]
editor: [code-editor, monaco]
performance: [perf, speed]
```
````

This duplicates information from `(aka: ...)` annotations in a machine-queryable format.

## Alias Resolution

1. Aliases resolve toward the canonical name. `{scape.right-sidebar}` → `{scape.inspector}`.
2. No alias chains. Each alias maps directly to one canonical token.
3. Resolution is advisory. Agents SHOULD normalize; humans MAY use aliases.
4. Unknown tokens pass through unchanged.

## Segment Types

Segment types (area, concern, quality) are determined by which section they appear in, not by position in a token. `{scape.terminal}` is an area because `terminal` is listed under `## Areas`.

Positional ordering (product → area → concern → specific) is conventional but not enforced.

## Version Handling

- Version is declared via HTML comment: `<!-- psl: v1.0.0 -->`
- Uses [SemVer](https://semver.org/)
- Tools SHOULD warn on unknown versions, not error
- Unknown sections are ignored, not rejected

## Escaping

In contexts where braces have special meaning (JavaScript template literals, MDX), use backtick-fencing: `` `{scape.inspector}` ``.

## What PSL Does Not Define

- Runtime resolution libraries
- Enforcement or linting rules
- How tokens map to code identifiers
- Required depth or ordering of segments

These are left to tooling and team convention.

## Example

```markdown
# PSL: Scape
<!-- psl: v1.0.0 -->

## Areas
- **inspector** (aka: right-sidebar, trailing-sidebar)
  - drag-handle, content, header
- **editor** (aka: code-editor, monaco)
  - tabs, gutter, minimap
- **terminal**
  - split, prompt, output

## Concerns
- **performance** (aka: perf, speed)
- **visual** (aka: ui, appearance)
- **crash** (aka: exc, fatal)

## Qualities
- **responsive** — interactions complete within one frame
- **non-blocking** — UI never freezes during async work

## Aliases
```yaml
inspector: [right-sidebar, trailing-sidebar]
editor: [code-editor, monaco]
performance: [perf, speed]
visual: [ui, appearance]
crash: [exc, fatal]
```
```

## License

This specification is released under [MIT](LICENSE).

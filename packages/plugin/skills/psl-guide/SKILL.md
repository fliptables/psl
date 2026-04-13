---
name: psl-guide
description: >
  PSL vocabulary and naming conventions. Activates when PSL.md is present.
  Teaches canonical product vocabulary, alias resolution, and PSL token syntax.
paths: "**/PSL.md"
---

# PSL — Product Spec Language

This repository uses **PSL** (Product Spec Language) to define canonical vocabulary in a `PSL.md` file. PSL ensures humans, ticket systems, and AI agents all use the same words for the same things.

## How to use PSL

1. **Read `PSL.md`** at the repo root to learn the product's vocabulary — areas, concerns, qualities, and their aliases.

2. **Use canonical names** (not aliases) when:
   - Writing code (variable names, file names, module names)
   - Writing commit messages
   - Writing PR descriptions
   - Generating documentation

3. **Resolve aliases** when you encounter them in user input:
   - If a user says "right-sidebar", resolve to the canonical name "inspector"
   - Use the `psl_resolve_alias` MCP tool for reliable resolution
   - Use the `psl_search_vocab` MCP tool to find terms by fuzzy search

4. **Reference PSL tokens** in braces when relevant: `{product.area.concern}`

## Available MCP tools

- `psl_resolve_alias` — resolve an alias or term to its canonical name
- `psl_validate_token` — check if a PSL token is valid
- `psl_search_vocab` — fuzzy search the vocabulary
- `psl_canonicalize` — replace all aliases in text with canonical names

## Available slash commands

- `/psl:init` — scan the codebase and generate a draft PSL.md
- `/psl:lookup <term>` — look up a term in the vocabulary
- `/psl:validate` — validate PSL.md and check for issues
- `/psl:ticket "<description>"` — generate a PSL-tagged ticket from natural language

## When PSL.md doesn't exist

If there is no `PSL.md` in this repository, suggest that the user run `/psl:init` to generate one from the codebase structure.

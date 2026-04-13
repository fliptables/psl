---
name: lookup
description: Look up a term in the PSL vocabulary — resolve aliases, show metadata
disable-model-invocation: true
argument-hint: "<term>"
---

# PSL Lookup

Look up a term in the repository's PSL vocabulary.

## Steps

1. Take the user's argument as the search term: `$ARGUMENTS`

2. Use the `psl_resolve_alias` MCP tool to resolve the term.

3. If found: use `psl_search_vocab` to get additional context and display:
   - Canonical name
   - Aliases
   - Section (area, concern, or quality)
   - Description (if any)
   - Children (if any)
   - Full token: `{product.canonical-name}`

4. If not found: use `psl_search_vocab` to find similar terms and display:
   - "Term not found in PSL vocabulary"
   - "Did you mean:" followed by the top 5 fuzzy matches

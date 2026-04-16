---
name: validate
description: Validate the PSL.md file for correctness and consistency
disable-model-invocation: true
---

# PSL Validate

Check the repository's `PSL.md` for structural issues, invalid tokens, and alias problems.

## Steps

1. Read `PSL.md` from the repo root. If it doesn't exist, tell the user to run `/psl:init` first.

2. Use the `psl_validate_token` MCP tool on a sample of tokens from the file to check for issues.

3. Report:
   - **Product name** and **spec version**
   - **Sections found** (areas, concerns, qualities, aliases, custom)
   - **Token count** per section
   - **Warnings** (if any): unknown version, invalid token names, alias conflicts, alias chains, malformed YAML
   - **Overall status**: "Valid" or "N issues found"

4. For each warning, explain what it means and suggest a fix.

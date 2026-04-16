---
name: init
description: Scan the codebase and generate a draft PSL.md vocabulary file
disable-model-invocation: true
argument-hint: "[--force] [--verbose]"
---

# Generate PSL.md

Scan the current repository and generate a draft `PSL.md` file that captures the product's vocabulary — areas, concerns, qualities, and aliases.

## Steps

1. Check if `PSL.md` already exists at the repo root.
   - If it exists and `--force` was NOT passed: tell the user it already exists and ask if they want to overwrite.
   - If it exists and `--force` was passed: proceed with overwrite.

2. Run the PSL scanner on the repository root:
   ```bash
   npx psl-init --force
   ```

3. Read the generated `PSL.md` and present a summary:
   - Product name detected
   - Number of areas found
   - Suggest the user edit the file to canonicalize the vocabulary

4. Remind the user: "Edit `PSL.md` to refine the vocabulary. Rename areas to match your team's canonical names, add aliases for terms people commonly use, and remove any noise from the scan."

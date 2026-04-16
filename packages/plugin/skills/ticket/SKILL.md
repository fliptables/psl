---
name: ticket
description: Generate a PSL-tagged ticket and engineer prompt from natural language
disable-model-invocation: true
argument-hint: "<description of what to build or fix>"
context: fork
---

# PSL Ticket Generator

Turn a natural-language description into a structured ticket with PSL tokens and an engineer-ready prompt.

## Input

The user's description: `$ARGUMENTS`

## Steps

1. Read `PSL.md` from the repo root. If it doesn't exist, proceed without vocabulary validation and note this in the output.

2. Ask 2-4 clarifying questions to understand:
   - Which area(s) of the product are affected (map to PSL areas)
   - What the acceptance criteria are
   - What concern type this is (performance, visual, crash, ux, etc.)
   - Any specific components or files involved

3. Map the user's description and answers to PSL tokens from the vocabulary.

4. Generate output in this format:

```markdown
## Ticket: <short title>
Tokens: {product.area.concern}

**Problem.** <clear problem statement using canonical PSL terms>

**Acceptance.** <measurable acceptance criteria>

---

## Engineer prompt
> <actionable prompt that can be pasted into Claude Code>
> References the specific PSL tokens and areas of the codebase.
> Includes acceptance criteria.
```

5. Validate that all PSL tokens in the output are valid using `psl_validate_token`.

6. Present the output to the user. They can copy it into their ticket tracker or paste the engineer prompt directly into Claude Code.

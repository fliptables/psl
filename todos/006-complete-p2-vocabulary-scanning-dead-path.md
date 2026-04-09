---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, dead-code, security]
---

# Vocabulary scanning produces no output + potential secret leakage

## Problem Statement

`scanExistingDocs` extracts bold terms from CLAUDE.md/AGENTS.md into a vocabulary map, but only with empty alias arrays. The generator only emits entries with non-empty aliases (generator.ts:75), so vocabulary terms never appear in output — dead data flow.

Additionally, bold terms from CLAUDE.md are extracted without filtering. A bold-formatted secret (`**sk-ant-xxxx**`) would be stored in the vocabulary map. While it currently doesn't reach output (because aliases are empty), if this is ever fixed the leak path exists.

## Proposed Solutions

1. **Option A**: Remove `scanExistingDocs` entirely and the `vocabulary` field from `ScanResult` — it does nothing.
2. **Option B**: Implement actual alias extraction (parse `aka:` patterns) and add a secret-pattern filter before emitting terms.

## Technical Details

- **Files**: `cli/src/scanner.ts` lines 611-635; `cli/src/generator.ts` lines 66-89

## Acceptance Criteria

- [ ] Either vocabulary scanning produces useful output OR is removed
- [ ] No path for bold terms from doc files to appear verbatim in output without filtering

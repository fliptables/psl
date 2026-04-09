---
status: complete
priority: p2
issue_id: "008"
tags: [code-review, performance]
---

# Sequential file I/O is the dominant bottleneck

## Problem Statement

Every scanner function reads files sequentially in a `for...await` loop. With 300 files at ~5ms each, that's 1.5s wasted on serial I/O where Node's event loop is idle.

Additional performance issues:
- `content.split("\n").length` allocates a full line array just to count lines
- `maxNestingDepth` uses `for...of` on string (Unicode overhead) instead of `charCodeAt`
- `countPatterns` allocates match arrays per pattern — regex objects recreated per file call
- Vue scanner walks the directory tree twice (once for .vue, once for .ts)

## Proposed Solutions

1. Parallel file analysis with concurrency limiter (16 concurrent reads). Expected 4-6x speedup.
2. Add file count cap to `collectFiles` (800 files) for monorepo safety.
3. Add file size skip (>100KB) to avoid generated/vendored files.
4. Pre-compile regex patterns at module scope.
5. Replace `content.split("\n").length` with `(content.match(/\n/g)?.length ?? 0) + 1`.
6. Use `charCodeAt` in `maxNestingDepth`.
7. Merge Vue's two `collectFiles` calls.

## Technical Details

- **Files**: `cli/src/scanner.ts` (all scan* functions), `cli/src/analyzer.ts` (countPatterns, maxNestingDepth)

## Acceptance Criteria

- [ ] File analysis runs with concurrency limiter
- [ ] 300-file Swift project completes in <500ms (down from ~1.5s)

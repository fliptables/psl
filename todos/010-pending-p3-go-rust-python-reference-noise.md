---
status: pending
priority: p3
issue_id: "010"
tags: [code-review, quality, analyzer]
---

# Go, Rust, and Python reference detection is noisy compared to Swift/React

## Problem Statement

Swift's reference detection uses suffix-gating (only matches identifiers ending in View, Controller, etc.) — precise, low noise. Go, Rust, and Python use broad uppercase identifier matching with incomplete blocklists. This means:

- Go: `GET`, `POST`, `WaitGroup`, `Context` all pollute the refs set
- Rust: `PathBuf`, `Duration`, `Bytes`, `AtomicUsize` not excluded
- Python: `from os import path` produces `Os` as a reference via `capitalize()`

The result is noisy dependency graphs for these languages with many false-positive edges.

Additionally:
- Go's first reference pass (`/\b([A-Z][A-Za-z0-9]+)\b\./g`) is a strict subset of the second — redundant
- Python's second import pass captures module names not imported names
- Ruby counts `.each`/`.map` as branch indicators; no other language counts iterators

## Proposed Solutions

1. Expand blocklists for Go, Rust, Python with common stdlib types
2. Remove Go's redundant first reference pass
3. Consider suffix-gating for languages with naming conventions (Java: *Service, *Controller, etc.)

## Technical Details

- **File**: `cli/src/analyzer.ts`, all language analyzer functions

## Acceptance Criteria

- [ ] Go, Rust, Python reference sets don't include common stdlib types
- [ ] No redundant regex passes

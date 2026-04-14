---
status: pending
priority: p3
issue_id: "028"
tags: [code-review, core, yagni]
---

# merge.ts is YAGNI and breaks validate()

## Problem Statement

`merge.ts` (59 lines) exists for a multi-PSL Chrome extension scenario with zero users. It also creates `productName: "merged"` which breaks `validate()` — calling `validate("{realproduct.area}", mergedVocab)` fails with "unknown product 'realproduct' — expected 'merged'".

## Proposed Solutions

1. Consider removing `merge.ts` for v1 since there are no users of this code path
2. If kept, fix `validate()` to handle multi-product vocabularies by accepting an array of product names

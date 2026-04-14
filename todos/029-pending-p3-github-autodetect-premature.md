---
status: pending
priority: p3
issue_id: "029"
tags: [code-review, chrome, yagni]
---

# GitHub PSL autodetect is premature with zero adoption

## Problem Statement

`checkGitHubPsl()` in `content.ts` (lines 499-542) fetches raw.githubusercontent.com to detect PSL.md on GitHub repos. With zero users and zero public PSL.md files, this is a feature for nobody. It consists of 43 lines of inline HTML/CSS banner construction that adds network requests on every GitHub page visit.

## Proposed Solutions

1. Remove `checkGitHubPsl()` for v1 and re-add when PSL has adoption

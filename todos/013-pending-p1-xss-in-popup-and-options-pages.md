---
status: pending
priority: p1
issue_id: "013"
tags: [code-review, security, chrome]
---

# XSS in popup and options pages via unescaped innerHTML interpolation

## Problem Statement

`packages/chrome/popup/popup.html` and `packages/chrome/options/options.html` interpolate `source.productName`, `source.url`, and `source.error` directly into `innerHTML` without escaping. The `productName` comes from parsing fetched PSL.md — a malicious PSL.md could set the H1 to `# PSL: <img src=x onerror=alert(1)>`. These pages run in the extension context with access to all `chrome.*` APIs — code execution means full extension compromise.

Note: the content script (`content.ts`) correctly uses `escapeHtml()` for its innerHTML, but the popup and options pages do not.

## Proposed Solutions

1. Add an `escapeHtml()` function to popup.html and options.html (or share the one from content.ts)
2. Apply it to all dynamically-inserted values
3. Better yet, use `textContent` and `document.createElement` instead of innerHTML template literals

## Acceptance Criteria

- [ ] All dynamically-inserted values in popup.html and options.html are escaped
- [ ] No raw `innerHTML` interpolation of untrusted data remains
- [ ] Extension context cannot be compromised via crafted PSL.md content

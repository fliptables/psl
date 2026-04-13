/// <reference types="chrome" />

import { parse, search, resolveDetailed, merge, type PslVocabulary, type SearchResult } from "@psl/core";

// ─── State ───

let vocab: PslVocabulary | null = null;
let dropdownHost: HTMLElement | null = null;
let dropdownShadow: ShadowRoot | null = null;
let dropdownEl: HTMLElement | null = null;
let activeTarget: HTMLTextAreaElement | HTMLElement | null = null;
let currentResults: SearchResult[] = [];
let selectedIndex = 0;
let queryStart = -1;

// ─── Load vocabularies from background ───

async function loadVocabularies(): Promise<void> {
  const data = await chrome.runtime.sendMessage({ type: "getVocabularies" });
  if (!data?.vocabularies) return;

  const vocabs: PslVocabulary[] = [];
  for (const content of Object.values(data.vocabularies) as string[]) {
    try {
      vocabs.push(parse(content));
    } catch {
      // skip unparseable
    }
  }

  vocab = vocabs.length > 0 ? merge(vocabs) : null;
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "psl-updated") {
    loadVocabularies();
  }
});

// ─── Dropdown UI (Shadow DOM) ───

const DROPDOWN_STYLES = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
  }
  .psl-dropdown {
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    max-height: 240px;
    overflow-y: auto;
    min-width: 240px;
    max-width: 400px;
    padding: 4px 0;
  }
  .psl-item {
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .psl-item:hover, .psl-item.selected {
    background: #16213e;
  }
  .psl-item-name {
    color: #e0e0e0;
    font-weight: 500;
  }
  .psl-item-token {
    color: #7b68ee;
    font-size: 11px;
    font-family: monospace;
  }
  .psl-item-desc {
    color: #888;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .psl-empty {
    padding: 8px 12px;
    color: #666;
    font-style: italic;
  }
`;

function ensureDropdown(): void {
  if (dropdownHost) return;

  dropdownHost = document.createElement("div");
  dropdownHost.id = "psl-autocomplete-host";
  document.body.appendChild(dropdownHost);
  dropdownShadow = dropdownHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = DROPDOWN_STYLES;
  dropdownShadow.appendChild(style);

  dropdownEl = document.createElement("div");
  dropdownEl.className = "psl-dropdown";
  dropdownEl.style.display = "none";
  dropdownShadow.appendChild(dropdownEl);
}

function showDropdown(x: number, y: number, results: SearchResult[]): void {
  ensureDropdown();
  if (!dropdownEl || !dropdownHost) return;

  currentResults = results;
  selectedIndex = 0;

  if (results.length === 0) {
    dropdownEl.innerHTML = '<div class="psl-empty">No matches</div>';
  } else {
    dropdownEl.innerHTML = results
      .slice(0, 8)
      .map(
        (r, i) => `
      <div class="psl-item${i === 0 ? " selected" : ""}" data-index="${i}">
        <span class="psl-item-name">${escapeHtml(r.canonical)}</span>
        <span class="psl-item-token">${escapeHtml(r.fullToken)}</span>
        ${r.description ? `<span class="psl-item-desc">${escapeHtml(r.description)}</span>` : ""}
      </div>
    `,
      )
      .join("");
  }

  dropdownHost.style.left = `${x}px`;
  dropdownHost.style.top = `${y + 20}px`;
  dropdownEl.style.display = "block";

  // Click handler
  dropdownEl.onclick = (e) => {
    const item = (e.target as HTMLElement).closest(".psl-item") as HTMLElement | null;
    if (item) {
      const idx = parseInt(item.dataset.index ?? "0", 10);
      insertToken(idx);
    }
  };
}

function hideDropdown(): void {
  if (dropdownEl) dropdownEl.style.display = "none";
  currentResults = [];
  activeTarget = null;
  queryStart = -1;
}

function isDropdownVisible(): boolean {
  return dropdownEl?.style.display === "block";
}

function updateSelection(index: number): void {
  if (!dropdownEl) return;
  selectedIndex = index;
  const items = dropdownEl.querySelectorAll(".psl-item");
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === index);
  });
}

// ─── Token insertion ───

function insertToken(index: number): void {
  const result = currentResults[index];
  if (!result || !activeTarget) return;

  const token = result.fullToken;

  if (activeTarget instanceof HTMLTextAreaElement) {
    const start = queryStart;
    const end = activeTarget.selectionStart;
    const text = activeTarget.value;
    activeTarget.value = text.slice(0, start) + token + text.slice(end);
    activeTarget.selectionStart = activeTarget.selectionEnd = start + token.length;
    activeTarget.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (activeTarget.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // Delete from queryStart to current position
    const textNode = range.startContainer;
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent ?? "";
      const beforeQuery = text.slice(0, queryStart - getTextOffset(textNode));
      const afterCursor = text.slice(range.startOffset);
      textNode.textContent = beforeQuery + token + afterCursor;

      // Move cursor after inserted token
      const newPos = beforeQuery.length + token.length;
      range.setStart(textNode, newPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  hideDropdown();
}

function getTextOffset(node: Node): number {
  // Get the offset of a text node relative to the start of its parent
  let offset = 0;
  const parent = node.parentNode;
  if (!parent) return 0;
  for (const child of parent.childNodes) {
    if (child === node) return offset;
    offset += (child.textContent ?? "").length;
  }
  return offset;
}

// ─── Cursor position helpers ───

function getCursorRect(target: HTMLTextAreaElement | HTMLElement): { x: number; y: number } | null {
  if (target instanceof HTMLTextAreaElement) {
    return getTextareaCursorPosition(target);
  }

  // contenteditable: use Selection API
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

function getTextareaCursorPosition(textarea: HTMLTextAreaElement): { x: number; y: number } {
  // Mirror technique: create a hidden div with same styling, measure cursor position
  const mirror = document.createElement("div");
  const style = window.getComputedStyle(textarea);

  mirror.style.cssText = `
    position: absolute; visibility: hidden; overflow: hidden; white-space: pre-wrap;
    word-wrap: break-word; top: 0; left: 0;
    font: ${style.font}; padding: ${style.padding}; border: ${style.border};
    width: ${style.width}; line-height: ${style.lineHeight}; letter-spacing: ${style.letterSpacing};
  `;

  const text = textarea.value.slice(0, textarea.selectionStart);
  mirror.textContent = text;

  const marker = document.createElement("span");
  marker.textContent = "|";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const rect = textarea.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  const x = rect.left + markerRect.left - mirror.getBoundingClientRect().left + textarea.scrollLeft;
  const y = rect.top + markerRect.top - mirror.getBoundingClientRect().top - textarea.scrollTop;

  document.body.removeChild(mirror);
  return { x, y };
}

// ─── Input handling ───

function handleInput(target: HTMLTextAreaElement | HTMLElement): void {
  if (!vocab) return;

  let text: string;
  let cursorPos: number;

  if (target instanceof HTMLTextAreaElement) {
    text = target.value;
    cursorPos = target.selectionStart;
  } else if (target.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return;
    text = textNode.textContent ?? "";
    cursorPos = range.startOffset;
  } else {
    return;
  }

  // Find the `{` that starts the current token
  const beforeCursor = text.slice(0, cursorPos);
  const bracePos = beforeCursor.lastIndexOf("{");

  if (bracePos === -1 || beforeCursor.includes("}", bracePos)) {
    hideDropdown();
    return;
  }

  const query = beforeCursor.slice(bracePos + 1);

  // Don't trigger on empty query right after `{` — wait for at least one char
  if (query.length === 0) {
    // Show all top-level results
    const results = search("", vocab, 0); // empty returns nothing, show popular instead
    if (results.length > 0) {
      queryStart = bracePos;
      activeTarget = target;
      const pos = getCursorRect(target);
      if (pos) showDropdown(pos.x, pos.y, results);
    }
    return;
  }

  // Strip product prefix for search (user types {myapp.dash → search "dash")
  const lastDot = query.lastIndexOf(".");
  const searchQuery = lastDot >= 0 ? query.slice(lastDot + 1) : query;

  const results = search(searchQuery, vocab, 8);
  if (results.length > 0) {
    queryStart = bracePos;
    activeTarget = target;
    const pos = getCursorRect(target);
    if (pos) showDropdown(pos.x, pos.y, results);
  } else {
    hideDropdown();
  }
}

// ─── Keyboard handling (capture phase) ───

function handleKeydown(e: KeyboardEvent): void {
  if (!isDropdownVisible()) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    const next = Math.min(selectedIndex + 1, currentResults.length - 1);
    updateSelection(next);
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    const prev = Math.max(selectedIndex - 1, 0);
    updateSelection(prev);
    return;
  }

  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    insertToken(selectedIndex);
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    hideDropdown();
    return;
  }
}

// ─── Hover tooltips ───

const TOOLTIP_STYLES = `
  .psl-tooltip {
    position: fixed;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 8px 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    color: #e0e0e0;
    z-index: 2147483646;
    max-width: 300px;
    pointer-events: none;
  }
  .psl-tooltip-name { font-weight: bold; color: #7b68ee; }
  .psl-tooltip-section { color: #888; font-size: 11px; }
  .psl-tooltip-aliases { color: #aaa; font-size: 11px; }
  .psl-tooltip-desc { margin-top: 4px; color: #ccc; }
`;

let tooltipHost: HTMLElement | null = null;
let tooltipShadow: ShadowRoot | null = null;
let tooltipEl: HTMLElement | null = null;

function ensureTooltip(): void {
  if (tooltipHost) return;
  tooltipHost = document.createElement("div");
  tooltipHost.id = "psl-tooltip-host";
  document.body.appendChild(tooltipHost);
  tooltipShadow = tooltipHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = TOOLTIP_STYLES;
  tooltipShadow.appendChild(style);

  tooltipEl = document.createElement("div");
  tooltipEl.className = "psl-tooltip";
  tooltipEl.style.display = "none";
  tooltipShadow.appendChild(tooltipEl);
}

const PSL_TOKEN_RE = /\{[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)*\}/g;

function scanForTokens(root: Element): void {
  if (!vocab) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    if (!text.includes("{")) continue;

    const parent = node.parentElement;
    if (!parent || parent.closest("[data-psl-scanned]")) continue;
    if (parent.tagName === "TEXTAREA" || parent.tagName === "INPUT") continue;
    if (parent.isContentEditable) continue;

    const matches = [...text.matchAll(PSL_TOKEN_RE)];
    if (matches.length === 0) continue;

    // Mark parent as scanned
    parent.setAttribute("data-psl-scanned", "true");

    // Add hover listeners to the parent
    parent.addEventListener("mousemove", (e: MouseEvent) => {
      const sel = window.getSelection();
      if (!sel) return;

      // Check if we're hovering over a PSL token
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range?.startContainer?.textContent) return;

      const fullText = range.startContainer.textContent;
      const offset = range.startOffset;

      // Find token at cursor position
      for (const match of fullText.matchAll(PSL_TOKEN_RE)) {
        const start = match.index!;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
          showTooltip(e.clientX, e.clientY, match[0]);
          return;
        }
      }
      hideTooltip();
    });

    parent.addEventListener("mouseleave", () => hideTooltip());
  }
}

let tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

function showTooltip(x: number, y: number, token: string): void {
  if (!vocab) return;
  if (tooltipTimeout) clearTimeout(tooltipTimeout);

  tooltipTimeout = setTimeout(() => {
    ensureTooltip();
    if (!tooltipEl || !tooltipHost) return;

    const inner = token.slice(1, -1);
    const segments = inner.split(".");
    const term = segments[segments.length - 1];
    const result = resolveDetailed(term, vocab!);

    if (!result.found) return;

    tooltipEl.innerHTML = `
      <div class="psl-tooltip-name">${escapeHtml(result.canonical)}</div>
      <div class="psl-tooltip-section">${escapeHtml(result.section ?? "")}</div>
      ${result.aliases.length > 0 ? `<div class="psl-tooltip-aliases">aka: ${escapeHtml(result.aliases.join(", "))}</div>` : ""}
      ${result.description ? `<div class="psl-tooltip-desc">${escapeHtml(result.description)}</div>` : ""}
      ${result.children.length > 0 ? `<div class="psl-tooltip-aliases">children: ${escapeHtml(result.children.join(", "))}</div>` : ""}
    `;

    tooltipHost.style.left = `${x + 10}px`;
    tooltipHost.style.top = `${y - 10}px`;
    tooltipEl.style.display = "block";
  }, 200);
}

function hideTooltip(): void {
  if (tooltipTimeout) clearTimeout(tooltipTimeout);
  if (tooltipEl) tooltipEl.style.display = "none";
}

// ─── GitHub auto-detect ───

function checkGitHubPsl(): void {
  if (!location.hostname.includes("github.com")) return;

  const match = location.pathname.match(/^\/([^/]+)\/([^/]+)/);
  if (!match) return;

  const [, owner, repo] = match;
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/PSL.md`;

  chrome.runtime.sendMessage({ type: "fetchPsl", url }, (result) => {
    if (result?.content) {
      // Check if already added
      chrome.runtime.sendMessage({ type: "getVocabularies" }, (data) => {
        if (data?.sources?.some((s: { url: string }) => s.url === url)) return;

        // Show subtle notification
        const banner = document.createElement("div");
        banner.style.cssText = `
          position: fixed; bottom: 20px; right: 20px; z-index: 999999;
          background: #1a1a2e; border: 1px solid #7b68ee; border-radius: 8px;
          padding: 12px 16px; color: #e0e0e0; font-family: -apple-system, sans-serif;
          font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); cursor: pointer;
          display: flex; gap: 12px; align-items: center;
        `;
        banner.innerHTML = `
          <span>PSL.md detected for <strong>${owner}/${repo}</strong></span>
          <button style="background:#7b68ee;color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer">Add</button>
          <button style="background:transparent;color:#888;border:1px solid #444;padding:4px 8px;border-radius:4px;cursor:pointer">Dismiss</button>
        `;

        const [addBtn, dismissBtn] = banner.querySelectorAll("button");
        addBtn.onclick = () => {
          chrome.runtime.sendMessage({ type: "addSource", url });
          banner.remove();
        };
        dismissBtn.onclick = () => banner.remove();

        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 15000);
      });
    }
  });
}

// ─── Attach listeners to targets ───

function attachToTarget(el: HTMLTextAreaElement | HTMLElement): void {
  if ((el as any).__pslAttached) return;
  (el as any).__pslAttached = true;

  el.addEventListener("input", () => handleInput(el));
  el.addEventListener("blur", () => setTimeout(hideDropdown, 200));
}

function scanForTargets(root: Element): void {
  // Plain textareas
  root.querySelectorAll("textarea").forEach((el) => attachToTarget(el));

  // Contenteditable elements
  root.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((el) => attachToTarget(el));

  // Known rich editor selectors
  root.querySelectorAll<HTMLElement>(".ProseMirror, .ql-editor, .cm-content").forEach((el) => {
    if (el.isContentEditable) attachToTarget(el);
  });
}

// ─── MutationObserver for SPA navigation ───

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      scanForTargets(el);
      scanForTokens(el);
    }
  }
});

// ─── Helpers ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Init ───

async function init(): Promise<void> {
  await loadVocabularies();

  // Keyboard handler in capture phase
  document.addEventListener("keydown", handleKeydown, true);

  // Initial scan
  scanForTargets(document.body);
  scanForTokens(document.body);

  // Watch for DOM changes
  observer.observe(document.body, { childList: true, subtree: true });

  // GitHub auto-detect
  checkGitHubPsl();
}

init();

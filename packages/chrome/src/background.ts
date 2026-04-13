/// <reference types="chrome" />

import { parse, type PslVocabulary } from "@psl/core";

interface PslSource {
  url: string;
  productName: string;
  etag?: string;
  lastFetched?: number;
  error?: string;
}

interface StoredData {
  sources: PslSource[];
  vocabularies: Record<string, string>; // url → raw PSL.md content
  autoDetect: boolean;
}

const REFRESH_ALARM = "refreshPSL";
const REFRESH_INTERVAL_MINUTES = 60;

// ─── Fetch and cache PSL files ───

async function fetchPsl(source: PslSource): Promise<{ content: string; etag?: string } | null> {
  try {
    const headers: Record<string, string> = {};
    if (source.etag) {
      headers["If-None-Match"] = source.etag;
    }

    const response = await fetch(source.url, { headers });

    if (response.status === 304) return null; // not modified
    if (!response.ok) return null;

    const content = await response.text();
    const etag = response.headers.get("ETag") ?? undefined;
    return { content, etag };
  } catch {
    return null;
  }
}

async function refreshAllSources(): Promise<void> {
  const data = await getStoredData();

  for (const source of data.sources) {
    const result = await fetchPsl(source);
    if (result) {
      data.vocabularies[source.url] = result.content;
      source.etag = result.etag;
      source.lastFetched = Date.now();
      source.error = undefined;

      // Parse to get product name
      try {
        const vocab = parse(result.content);
        source.productName = vocab.productName;
      } catch {
        source.error = "Failed to parse PSL.md";
      }
    }
  }

  await chrome.storage.local.set({ pslData: data });

  // Notify content scripts
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "psl-updated" }).catch(() => {});
    }
  }
}

async function getStoredData(): Promise<StoredData> {
  const result = await chrome.storage.local.get("pslData");
  return result.pslData ?? { sources: [], vocabularies: {}, autoDetect: true };
}

// ─── Message handlers ───

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "fetchPsl") {
    fetchPsl({ url: message.url, productName: "" })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true; // async
  }

  if (message.type === "addSource") {
    (async () => {
      const data = await getStoredData();
      const existing = data.sources.find((s) => s.url === message.url);
      if (existing) {
        sendResponse({ ok: false, error: "Already added" });
        return;
      }

      const result = await fetchPsl({ url: message.url, productName: "" });
      if (!result) {
        sendResponse({ ok: false, error: "Failed to fetch" });
        return;
      }

      let productName = "unknown";
      try {
        const vocab = parse(result.content);
        productName = vocab.productName;
      } catch {
        // keep unknown
      }

      data.sources.push({
        url: message.url,
        productName,
        etag: result.etag,
        lastFetched: Date.now(),
      });
      data.vocabularies[message.url] = result.content;

      await chrome.storage.local.set({ pslData: data });
      sendResponse({ ok: true, productName });
    })();
    return true;
  }

  if (message.type === "removeSource") {
    (async () => {
      const data = await getStoredData();
      data.sources = data.sources.filter((s) => s.url !== message.url);
      delete data.vocabularies[message.url];
      await chrome.storage.local.set({ pslData: data });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "getVocabularies") {
    (async () => {
      const data = await getStoredData();
      sendResponse(data);
    })();
    return true;
  }

  if (message.type === "refresh") {
    refreshAllSources().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

// ─── Alarm for periodic refresh ───

chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshAllSources();
  }
});

// ─── Install event ───

chrome.runtime.onInstalled.addListener(() => {
  console.log("PSL extension installed");
});

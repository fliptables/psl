#!/usr/bin/env node

import { readFile, watch } from "node:fs/promises";
import { resolve, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  parse,
  resolve as pslResolve,
  validate,
  search,
  canonicalize,
  type PslVocabulary,
} from "@psl/core";

// ─── State ───

let vocab: PslVocabulary | null = null;
let pslPath: string | null = null;

// ─── PSL.md discovery and loading ───

async function findPslMd(startDir: string): Promise<string | null> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "PSL.md");
    try {
      await readFile(candidate, "utf-8");
      return candidate;
    } catch {
      const parent = resolve(dir, "..");
      if (parent === dir) return null;
      dir = parent;
    }
  }
  return null;
}

async function loadVocab(): Promise<void> {
  if (!pslPath) {
    pslPath = await findPslMd(process.cwd());
  }
  if (!pslPath) {
    vocab = null;
    return;
  }
  try {
    const content = await readFile(pslPath, "utf-8");
    vocab = parse(content);
  } catch {
    vocab = null;
  }
}

function requireVocab(): PslVocabulary {
  if (!vocab) {
    throw new Error(
      "No PSL.md found. Run `/psl:init` to generate one for this repository.",
    );
  }
  return vocab;
}

// ─── Watch for PSL.md changes ───

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function watchPslMd(): Promise<void> {
  if (!pslPath) return;
  try {
    const watcher = watch(pslPath);
    for await (const event of watcher) {
      if (event.eventType === "change") {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadVocab(), 500);
      }
    }
  } catch {
    // file deleted or watcher error — ignore
  }
}

// ─── MCP Server ───

const server = new McpServer(
  { name: "psl", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// Tool: psl_resolve_alias
server.registerTool(
  "psl_resolve_alias",
  {
    description: "Resolve a PSL alias or term to its canonical name",
    inputSchema: { term: z.string().describe("The alias or term to resolve") },
  },
  async ({ term }) => {
    const v = requireVocab();
    const result = pslResolve(term, v);
    if (result.found) {
      return {
        content: [{ type: "text", text: JSON.stringify({ canonical: result.canonical }) }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "not_found", suggestions: result.suggestions }),
        },
      ],
    };
  },
);

// Tool: psl_validate_token
server.registerTool(
  "psl_validate_token",
  {
    description: "Validate a PSL token for correct syntax and vocabulary membership",
    inputSchema: { token: z.string().describe("The PSL token to validate, e.g. {product.area.concern}") },
  },
  async ({ token }) => {
    const v = vocab; // allow validation without vocab (syntax-only)
    const result = validate(token, v ?? undefined);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            valid: result.valid,
            errors: result.errors.map((e) => e.message),
          }),
        },
      ],
    };
  },
);

// Tool: psl_search_vocab
server.registerTool(
  "psl_search_vocab",
  {
    description: "Fuzzy search the PSL vocabulary for matching terms",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 10)"),
    },
  },
  async ({ query, limit }) => {
    const v = requireVocab();
    const results = search(query, v, limit ?? 10);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: results.map((r) => ({
              canonical: r.canonical,
              type: r.matchedVia,
              aliases: [], // would need resolveDetailed for this
              token: r.fullToken,
            })),
          }),
        },
      ],
    };
  },
);

// Tool: psl_canonicalize
server.registerTool(
  "psl_canonicalize",
  {
    description: "Replace all PSL aliases in text with their canonical names",
    inputSchema: { text: z.string().describe("Text containing PSL tokens to canonicalize") },
  },
  async ({ text }) => {
    const v = requireVocab();
    const result = canonicalize(text, v);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            canonicalized: result.text,
            replacements: result.replacements.map((r) => ({
              original: r.original,
              canonical: r.canonical,
            })),
          }),
        },
      ],
    };
  },
);

// ─── Start ───

async function main() {
  await loadVocab();
  watchPslMd().catch(() => {}); // fire and forget

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is the JSON-RPC channel)
  console.error(
    `PSL MCP server started${pslPath ? ` (watching ${pslPath})` : " (no PSL.md found)"}`,
  );
}

main().catch((err) => {
  console.error("PSL MCP server error:", err);
  process.exit(1);
});

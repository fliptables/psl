import type {
  PslVocabulary,
  PslToken,
  ResolveResult,
  ResolveDetailedResult,
} from "./types.js";
import { search } from "./searcher.js";

/** Resolve a term to its canonical name. Thin response for MCP tools. */
export function resolve(term: string, vocab: PslVocabulary): ResolveResult {
  const normalized = term.toLowerCase().replace(/^\{|\}$/g, "");

  // Direct canonical match
  if (vocab.tokens.has(normalized)) {
    return { found: true, canonical: normalized };
  }

  // Alias match
  const canonical = vocab.aliases.get(normalized);
  if (canonical) {
    return { found: true, canonical };
  }

  // Not found — provide fuzzy suggestions
  const suggestions = search(normalized, vocab, 3).map((r) => r.canonical);
  return { found: false, suggestions };
}

/** Resolve a term with full metadata. Rich response for tooltips and lookup. */
export function resolveDetailed(
  term: string,
  vocab: PslVocabulary,
): ResolveDetailedResult {
  const normalized = term.toLowerCase().replace(/^\{|\}$/g, "");
  const notFound: ResolveDetailedResult = {
    found: false,
    canonical: normalized,
    path: [],
    aliases: [],
    matchedVia: "not_found",
    children: [],
  };

  // Direct canonical match
  let token = vocab.tokens.get(normalized);
  let matchedVia: ResolveDetailedResult["matchedVia"] = "canonical";

  // Alias match
  if (!token) {
    const canonical = vocab.aliases.get(normalized);
    if (canonical) {
      token = vocab.tokens.get(canonical);
      matchedVia = "alias";
    }
  }

  if (!token) return notFound;

  return {
    found: true,
    canonical: token.canonical,
    path: buildPath(token, vocab),
    aliases: token.aliases,
    matchedVia,
    description: token.description,
    section: token.section,
    children: token.children.map((c) => c.canonical),
  };
}

function buildPath(token: PslToken, vocab: PslVocabulary): string[] {
  const path = [vocab.productName, token.canonical];

  // Walk up: find any parent that has this token as a child
  for (const parent of vocab.tokens.values()) {
    if (parent.children.some((c) => c.canonical === token.canonical)) {
      return [vocab.productName, parent.canonical, token.canonical];
    }
  }

  return path;
}

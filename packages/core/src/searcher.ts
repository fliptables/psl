import type { PslVocabulary, SearchResult } from "./types.js";

/**
 * Fuzzy search across a PSL vocabulary.
 * No external dependencies — lightweight scoring: prefix > substring > character-level.
 */
export function search(
  query: string,
  vocab: PslVocabulary,
  limit = 10,
): SearchResult[] {
  if (!query) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const token of vocab.tokens.values()) {
    // Score against canonical name
    const canonicalScore = score(q, token.canonical);
    if (canonicalScore > 0) {
      results.push({
        canonical: token.canonical,
        score: canonicalScore,
        matchedVia: "canonical",
        product: vocab.productName,
        fullToken: `{${vocab.productName}.${token.canonical}}`,
        description: token.description,
      });
      continue; // don't double-count
    }

    // Score against aliases
    let bestAliasScore = 0;
    for (const alias of token.aliases) {
      bestAliasScore = Math.max(bestAliasScore, score(q, alias));
    }
    if (bestAliasScore > 0) {
      results.push({
        canonical: token.canonical,
        score: bestAliasScore * 0.9, // slight penalty for alias match
        matchedVia: "alias",
        product: vocab.productName,
        fullToken: `{${vocab.productName}.${token.canonical}}`,
        description: token.description,
      });
      continue;
    }

    // Score against description
    if (token.description) {
      const descScore = score(q, token.description);
      if (descScore > 0) {
        results.push({
          canonical: token.canonical,
          score: descScore * 0.7, // lower weight for description match
          matchedVia: "description",
          product: vocab.productName,
          fullToken: `{${vocab.productName}.${token.canonical}}`,
          description: token.description,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Simple scoring function:
 * - Exact match: 1.0
 * - Prefix match: 0.9
 * - Substring match: 0.7
 * - Character-level fuzzy: 0.1–0.5 based on coverage
 */
function score(query: string, target: string): number {
  const t = target.toLowerCase();

  if (t === query) return 1.0;
  if (t.startsWith(query)) return 0.9;
  if (t.includes(query)) return 0.7;

  // Character-level fuzzy: what fraction of query chars appear in order?
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < query.length; ti++) {
    if (t[ti] === query[qi]) qi++;
  }
  const coverage = qi / query.length;
  return coverage >= 0.6 ? coverage * 0.5 : 0;
}

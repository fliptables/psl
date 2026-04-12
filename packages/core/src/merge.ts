import type { PslVocabulary, PslWarning } from "./types.js";

/**
 * Merge multiple PslVocabulary instances (for Chrome extension multi-PSL).
 * Each vocabulary retains its product name as a namespace.
 * Conflicts in aliases across products are warned about but both kept.
 */
export function merge(vocabs: PslVocabulary[]): PslVocabulary {
  if (vocabs.length === 0) {
    return {
      productName: "merged",
      specVersion: "1.0.0",
      sections: [],
      aliases: new Map(),
      tokens: new Map(),
      warnings: [],
    };
  }

  if (vocabs.length === 1) return vocabs[0];

  const warnings: PslWarning[] = [];
  const allAliases = new Map<string, string>();
  const allTokens = new Map<string, (typeof vocabs)[0]["tokens"] extends Map<string, infer T> ? T : never>();

  for (const vocab of vocabs) {
    // Namespace tokens by product: "dashboard" → stored as-is but searchable
    for (const [name, token] of vocab.tokens) {
      const key = `${vocab.productName}.${name}`;
      allTokens.set(key, token);
      // Also keep un-namespaced for direct lookups
      if (allTokens.has(name)) {
        // Conflict — token exists in multiple products
        // Keep both, user disambiguates via product prefix in search
      } else {
        allTokens.set(name, token);
      }
    }

    for (const [alias, canonical] of vocab.aliases) {
      if (allAliases.has(alias) && allAliases.get(alias) !== canonical) {
        warnings.push({
          message: `Alias "${alias}" defined in multiple PSLs: "${allAliases.get(alias)}" and "${canonical}" (from ${vocab.productName})`,
          code: "alias_conflict",
        });
      }
      allAliases.set(alias, canonical);
    }
  }

  return {
    productName: "merged",
    specVersion: "1.0.0",
    sections: vocabs.flatMap((v) => v.sections),
    aliases: allAliases,
    tokens: allTokens,
    warnings: [...vocabs.flatMap((v) => v.warnings), ...warnings],
  };
}

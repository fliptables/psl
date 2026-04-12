import type { PslVocabulary } from "./types.js";

/** Find all PSL tokens in text and replace aliases with canonical names. */
export function canonicalize(
  text: string,
  vocab: PslVocabulary,
): {
  text: string;
  replacements: { original: string; canonical: string; position: number }[];
} {
  const TOKEN_RE = /\{([a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)*)\}/g;
  const replacements: { original: string; canonical: string; position: number }[] = [];
  let offset = 0;

  const result = text.replace(TOKEN_RE, (match, inner: string, pos: number) => {
    const segments = inner.split(".");
    let changed = false;

    const canonical = segments.map((seg, i) => {
      // Don't touch the product name (first segment)
      if (i === 0) return seg;
      const resolved = vocab.aliases.get(seg);
      if (resolved) {
        changed = true;
        return resolved;
      }
      return seg;
    });

    if (changed) {
      const canonicalToken = `{${canonical.join(".")}}`;
      replacements.push({
        original: match,
        canonical: canonicalToken,
        position: pos + offset,
      });
      offset += canonicalToken.length - match.length;
      return canonicalToken;
    }

    return match;
  });

  return { text: result, replacements };
}

import type { PslVocabulary, ValidationResult, ValidationError } from "./types.js";

/**
 * PSL token syntax regex from SPEC.md:
 * {[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*}
 */
const TOKEN_SYNTAX_RE = /^\{[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*\}$/;

/** Validate a PSL token string for syntax and optionally against a vocabulary. */
export function validate(token: string, vocab?: PslVocabulary): ValidationResult {
  const errors: ValidationError[] = [];

  // Syntax check
  if (!TOKEN_SYNTAX_RE.test(token)) {
    errors.push({
      message: `Token "${token}" does not match PSL syntax: {product.area.concern}`,
      token,
      code: "syntax",
    });
    return { valid: false, errors };
  }

  // If no vocabulary, syntax-only validation passes
  if (!vocab) {
    return { valid: true, errors: [] };
  }

  // Extract segments
  const inner = token.slice(1, -1); // strip braces
  const segments = inner.split(".");

  // First segment is the product name
  if (segments[0] !== vocab.productName) {
    errors.push({
      message: `Unknown product "${segments[0]}" — expected "${vocab.productName}"`,
      token,
      code: "unknown_product",
    });
  }

  // Remaining segments should be known tokens or resolvable aliases
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const isKnown =
      vocab.tokens.has(segment) ||
      vocab.aliases.has(segment) ||
      isChildToken(segment, vocab);

    if (!isKnown) {
      errors.push({
        message: `Unknown segment "${segment}" in token "${token}"`,
        token,
        code: "unknown_segment",
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function isChildToken(name: string, vocab: PslVocabulary): boolean {
  for (const token of vocab.tokens.values()) {
    if (hasDescendant(token, name)) return true;
  }
  return false;
}

function hasDescendant(token: { canonical: string; children: typeof token[] }, name: string): boolean {
  for (const child of token.children) {
    if (child.canonical === name) return true;
    if (hasDescendant(child, name)) return true;
  }
  return false;
}

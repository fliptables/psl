/** A parsed PSL vocabulary from a PSL.md file */
export interface PslVocabulary {
  productName: string;
  specVersion: string;
  sections: PslSection[];
  aliases: Map<string, string>;
  tokens: Map<string, PslToken>;
  warnings: PslWarning[];
}

export interface PslSection {
  type: "areas" | "concerns" | "qualities" | "aliases" | "custom";
  heading: string;
  tokens: PslToken[];
}

export interface PslToken {
  canonical: string;
  aliases: string[];
  description?: string;
  children: PslToken[];
  section: "areas" | "concerns" | "qualities" | "custom";
  line: number;
}

export type PslWarningCode =
  | "unknown_version"
  | "malformed_alias"
  | "invalid_token_name"
  | "alias_conflict"
  | "alias_chain"
  | "yaml_parse_error"
  | "missing_header"
  | "missing_version";

export interface PslWarning {
  message: string;
  line?: number;
  code: PslWarningCode;
}

export type ResolveResult =
  | { found: true; canonical: string }
  | { found: false; suggestions: string[] };

export interface ResolveDetailedResult {
  found: boolean;
  canonical: string;
  path: string[];
  aliases: string[];
  matchedVia: "canonical" | "alias" | "not_found";
  description?: string;
  section?: string;
  children: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  message: string;
  token: string;
  code: "syntax" | "unknown_segment" | "unknown_product";
}

export interface SearchResult {
  canonical: string;
  score: number;
  matchedVia: "canonical" | "alias" | "description";
  product: string;
  fullToken: string;
  description?: string;
}

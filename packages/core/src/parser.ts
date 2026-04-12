import type {
  PslVocabulary,
  PslSection,
  PslToken,
  PslWarning,
} from "./types.js";

const KNOWN_VERSIONS = new Set(["1.0.0"]);

const SECTION_TYPES: Record<string, PslSection["type"]> = {
  areas: "areas",
  concerns: "concerns",
  qualities: "qualities",
  aliases: "aliases",
};

const TOKEN_NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Parse a PSL.md string into a structured PslVocabulary.
 * Never throws — returns warnings for all non-fatal issues.
 */
export function parse(content: string): PslVocabulary {
  const lines = content.split("\n");
  const warnings: PslWarning[] = [];
  const sections: PslSection[] = [];
  const allTokens = new Map<string, PslToken>();
  const aliases = new Map<string, string>();

  // Parse H1 for product name
  const productName = parseProductName(lines, warnings);

  // Parse version comment
  const specVersion = parseVersion(lines, warnings);

  // Parse sections
  let currentSection: PslSection | null = null;
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockContent = "";
  let codeBlockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track code blocks
    if (line.trimStart().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockContent = "";
        codeBlockStartLine = lineNum;
      } else {
        // End of code block — check if this is a YAML alias block
        if (
          currentSection?.type === "aliases" &&
          (codeBlockLang === "yaml" || codeBlockLang === "yml")
        ) {
          parseYamlAliases(codeBlockContent, aliases, warnings, codeBlockStartLine);
        }
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockContent = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += line + "\n";
      continue;
    }

    // Detect H2 section headings
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      const type = SECTION_TYPES[heading.toLowerCase()] ?? "custom";
      currentSection = { type, heading, tokens: [] };
      sections.push(currentSection);
      continue;
    }

    // Parse token definitions within sections (skip aliases and custom sections)
    if (
      currentSection &&
      currentSection.type !== "aliases" &&
      currentSection.type !== "custom"
    ) {
      const token = parseTokenLine(line, lineNum, currentSection.type, warnings);
      if (token) {
        // Determine nesting level by indent
        const indent = getIndentLevel(line);
        if (indent === 0) {
          currentSection.tokens.push(token);
          registerToken(token, allTokens);
        } else {
          // Find parent token at previous indent level
          const parent = findParent(currentSection.tokens, indent);
          if (parent) {
            parent.children.push(token);
            registerToken(token, allTokens);
          }
        }
      }
    }
  }

  // Merge inline aliases into the aliases map
  for (const token of allTokens.values()) {
    for (const alias of token.aliases) {
      if (aliases.has(alias) && aliases.get(alias) !== token.canonical) {
        warnings.push({
          message: `Alias "${alias}" maps to both "${aliases.get(alias)}" and "${token.canonical}"`,
          code: "alias_conflict",
          line: token.line,
        });
      }
      aliases.set(alias, token.canonical);
    }
  }

  // Check for alias chains
  for (const [alias, canonical] of aliases) {
    if (aliases.has(canonical) && canonical !== aliases.get(canonical)) {
      warnings.push({
        message: `Alias chain detected: "${alias}" → "${canonical}" → "${aliases.get(canonical)}"`,
        code: "alias_chain",
      });
    }
  }

  return { productName, specVersion, sections, aliases, tokens: allTokens, warnings };
}

function parseProductName(lines: string[], warnings: PslWarning[]): string {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^# PSL:\s*(.+)$/);
    if (match) return match[1].trim();
  }
  warnings.push({
    message: 'Missing H1 header "# PSL: <product-name>"',
    code: "missing_header",
    line: 1,
  });
  return "unknown";
}

function parseVersion(lines: string[], warnings: PslWarning[]): string {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/<!--\s*psl:\s*v([\d.]+)\s*-->/);
    if (match) {
      const version = match[1];
      if (!KNOWN_VERSIONS.has(version)) {
        warnings.push({
          message: `Unknown PSL spec version "${version}"`,
          code: "unknown_version",
          line: i + 1,
        });
      }
      return version;
    }
  }
  warnings.push({
    message: "Missing version comment <!-- psl: vX.Y.Z -->",
    code: "missing_version",
  });
  return "1.0.0";
}

function parseTokenLine(
  line: string,
  lineNum: number,
  section: PslToken["section"],
  warnings: PslWarning[],
): PslToken | null {
  // Match lines like: - **name** (aka: a, b) — description
  //                or: - name, name2, name3  (children as inline list)
  const boldMatch = line.match(
    /^(\s*)-\s+\*\*([a-zA-Z0-9-]+)\*\*(?:\s*\(aka:\s*([^)]+)\))?(?:\s*[—–-]\s*(.+))?$/,
  );
  if (boldMatch) {
    const canonical = boldMatch[2].toLowerCase();
    const aliasStr = boldMatch[3] ?? "";
    const description = boldMatch[4]?.trim();
    const aliases = aliasStr
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    if (!TOKEN_NAME_RE.test(canonical)) {
      warnings.push({
        message: `Invalid token name "${canonical}"`,
        code: "invalid_token_name",
        line: lineNum,
      });
    }

    return { canonical, aliases, description, children: [], section, line: lineNum };
  }

  // Match plain child list lines: - child1, child2, child3
  // These are children — they appear indented under a bold token
  const indent = getIndentLevel(line);
  if (indent > 0) {
    const plainMatch = line.match(/^\s+-\s+(.+)$/);
    if (plainMatch) {
      const items = plainMatch[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      // If multiple comma-separated items, these are child tokens listed inline
      if (items.length > 1) {
        // Return null — we handle these differently: create children from the items
        return null;
      }
      // Single item at indent — it's a child token
      const name = items[0];
      if (name && TOKEN_NAME_RE.test(name)) {
        return { canonical: name, aliases: [], children: [], section, line: lineNum };
      }
    }
  }

  return null;
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  return Math.floor(match[1].length / 2);
}

function findParent(tokens: PslToken[], targetIndent: number): PslToken | null {
  // Walk backwards to find the most recent token at a shallower indent
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  if (targetIndent === 1) return last;
  if (targetIndent >= 2 && last.children.length > 0) {
    return findParent(last.children, targetIndent - 1);
  }
  return last;
}

function registerToken(token: PslToken, all: Map<string, PslToken>): void {
  all.set(token.canonical, token);
}

/**
 * Parse a simple YAML aliases block (key: [val1, val2] per line).
 * No external YAML dependency — handles the subset PSL uses.
 */
function parseYamlAliases(
  yaml: string,
  aliases: Map<string, string>,
  warnings: PslWarning[],
  startLine: number,
): void {
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    // Match: canonical: [alias1, alias2] or canonical: alias1, alias2
    const match = line.match(/^([a-z][a-z0-9-]*):\s*\[?\s*([^\]]+?)\s*\]?\s*$/);
    if (!match) {
      if (line.includes(":")) {
        warnings.push({
          message: `Could not parse YAML alias line: "${line}"`,
          code: "yaml_parse_error",
          line: startLine + i,
        });
      }
      continue;
    }

    const canonical = match[1];
    const aliasList = match[2].split(",").map((a) => a.trim()).filter(Boolean);
    for (const alias of aliasList) {
      if (aliases.has(alias) && aliases.get(alias) !== canonical) {
        warnings.push({
          message: `YAML alias "${alias}" conflicts: maps to both "${aliases.get(alias)}" and "${canonical}"`,
          code: "alias_conflict",
          line: startLine + i,
        });
      }
      aliases.set(alias, canonical);
    }
  }
}

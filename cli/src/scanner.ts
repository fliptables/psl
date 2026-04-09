import { opendir, readFile, stat } from "node:fs/promises";
import { join, basename, relative } from "node:path";
import ignore, { type Ignore } from "ignore";

export interface AreaToken {
  name: string;
  children: string[];
  source: "directory" | "filename" | "docs";
}

export interface ScanResult {
  productName: string | null;
  areas: AreaToken[];
  concerns: string[];
  vocabulary: Map<string, string[]>;
}

const SENSITIVE_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".npmrc",
  ".netrc",
  "credentials.json",
  "secrets.json",
  "id_rsa",
  "id_ed25519",
]);

const SENSITIVE_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);

function isSensitive(name: string): boolean {
  if (SENSITIVE_FILES.has(name)) return true;
  for (const ext of SENSITIVE_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "__pycache__",
  ".cache",
  "vendor",
  "Pods",
  "DerivedData",
  ".build",
  "target",
  "coverage",
  ".turbo",
]);

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

async function loadGitignore(root: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const content = await readFile(join(root, ".gitignore"), "utf-8");
    ig.add(content);
  } catch {
    // no .gitignore
  }
  return ig;
}

async function detectProductName(root: string): Promise<string | null> {
  // Try package.json
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    if (pkg.name && typeof pkg.name === "string") {
      const name = pkg.name.replace(/^@[^/]+\//, ""); // strip scope
      return toKebabCase(name) || null;
    }
  } catch {
    // no package.json
  }

  // Try Cargo.toml
  try {
    const cargo = await readFile(join(root, "Cargo.toml"), "utf-8");
    const match = cargo.match(/name\s*=\s*"([^"]+)"/);
    if (match) return toKebabCase(match[1]) || null;
  } catch {
    // no Cargo.toml
  }

  // Try setup.py / pyproject.toml
  try {
    const pyproject = await readFile(join(root, "pyproject.toml"), "utf-8");
    const match = pyproject.match(/name\s*=\s*"([^"]+)"/);
    if (match) return toKebabCase(match[1]) || null;
  } catch {
    // no pyproject.toml
  }

  // Fallback to directory name
  return toKebabCase(basename(root)) || null;
}

async function scanDirectories(
  root: string,
  ig: Ignore,
  maxDepth: number,
): Promise<AreaToken[]> {
  const areas: AreaToken[] = [];

  try {
    const dir = await opendir(root);
    for await (const entry of dir) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      if (ig.ignores(entry.name + "/")) continue;

      const kebabName = toKebabCase(entry.name);
      if (!kebabName) continue;

      const children: string[] = [];

      if (maxDepth > 1) {
        try {
          const subDir = await opendir(join(root, entry.name));
          for await (const subEntry of subDir) {
            if (subEntry.name.startsWith(".")) continue;
            if (SKIP_DIRS.has(subEntry.name)) continue;
            if (isSensitive(subEntry.name)) continue;

            if (subEntry.isDirectory()) {
              const childName = toKebabCase(subEntry.name);
              if (childName) children.push(childName);
            } else if (subEntry.isFile()) {
              // Extract area from filename (strip extension)
              const nameWithoutExt = subEntry.name.replace(/\.[^.]+$/, "");
              const childName = toKebabCase(nameWithoutExt);
              if (childName && childName.length > 2 && childName.length < 40) {
                children.push(childName);
              }
            }
          }
        } catch {
          // can't read subdirectory
        }
      }

      // Deduplicate and limit children
      const uniqueChildren = [...new Set(children)].slice(0, 10);

      areas.push({
        name: kebabName,
        children: uniqueChildren,
        source: "directory",
      });
    }
  } catch {
    // can't read root
  }

  return areas;
}

async function scanExistingDocs(
  root: string,
): Promise<{ areas: AreaToken[]; vocabulary: Map<string, string[]> }> {
  const areas: AreaToken[] = [];
  const vocabulary = new Map<string, string[]>();

  // Try reading CLAUDE.md for vocabulary hints
  const docPaths = [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/design-system/vocabulary.md",
    "docs/vocabulary.md",
  ];

  for (const docPath of docPaths) {
    try {
      const content = await readFile(join(root, docPath), "utf-8");
      // Extract bold terms as potential area names
      const boldTerms = content.matchAll(/\*\*([A-Za-z][A-Za-z0-9 -]+)\*\*/g);
      for (const match of boldTerms) {
        const term = toKebabCase(match[1]);
        if (term && term.length > 1 && term.length < 30) {
          if (!vocabulary.has(term)) {
            vocabulary.set(term, []);
          }
        }
      }
    } catch {
      // file not found
    }
  }

  return { areas, vocabulary };
}

export async function scan(
  root: string,
  options: { git?: boolean; verbose?: boolean } = {},
): Promise<ScanResult> {
  const realRoot = await stat(root)
    .then(() => root)
    .catch(() => {
      throw new Error(`Path does not exist: ${root}`);
    });

  const ig = await loadGitignore(realRoot);
  const productName = await detectProductName(realRoot);

  if (options.verbose) {
    console.log(`Scanning: ${realRoot}`);
    console.log(`Product name: ${productName ?? "(unknown)"}`);
  }

  const [dirAreas, docResult] = await Promise.all([
    scanDirectories(realRoot, ig, 2),
    scanExistingDocs(realRoot),
  ]);

  // Merge areas from directories and docs
  const areaMap = new Map<string, AreaToken>();
  for (const area of [...dirAreas, ...docResult.areas]) {
    const existing = areaMap.get(area.name);
    if (existing) {
      existing.children = [
        ...new Set([...existing.children, ...area.children]),
      ].slice(0, 10);
    } else {
      areaMap.set(area.name, { ...area });
    }
  }

  // Default concerns (most projects have these)
  const concerns = [
    "performance",
    "visual",
    "crash",
    "ux",
    "data",
    "lifecycle",
  ];

  if (options.verbose) {
    console.log(`Found ${areaMap.size} areas`);
    console.log(`Vocabulary terms: ${docResult.vocabulary.size}`);
  }

  return {
    productName,
    areas: [...areaMap.values()],
    concerns,
    vocabulary: docResult.vocabulary,
  };
}

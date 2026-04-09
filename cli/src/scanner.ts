import { opendir, readFile, readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import ignore, { type Ignore } from "ignore";
import {
  analyzeSwiftFile,
  analyzeReactFile,
  buildGraph,
  graphToMermaid,
  graphToAreas,
  type FileNode,
} from "./analyzer.js";

export interface AreaToken {
  name: string;
  children: string[];
  source: "view" | "component" | "controller" | "directory" | "docs";
}

export interface ScanResult {
  productName: string | null;
  projectType: ProjectType;
  areas: AreaToken[];
  concerns: string[];
  vocabulary: Map<string, string[]>;
  mermaid: string;
}

type ProjectType =
  | "swift"
  | "react"
  | "nextjs"
  | "vue"
  | "rails"
  | "django"
  | "go"
  | "rust"
  | "generic";

const SENSITIVE_FILES = new Set([
  ".env", ".env.local", ".env.production", ".npmrc", ".netrc",
  "credentials.json", "secrets.json", "id_rsa", "id_ed25519",
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
  "node_modules", ".git", ".svn", ".hg", "dist", "build", "out",
  ".next", ".nuxt", "__pycache__", ".cache", "vendor", "Pods",
  "DerivedData", ".build", "target", "coverage", ".turbo", ".output",
]);

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

/** Strip common suffixes to get the semantic name */
function stripSuffix(name: string, suffixes: string[]): string {
  for (const suffix of suffixes) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}

async function loadGitignore(root: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const content = await readFile(join(root, ".gitignore"), "utf-8");
    ig.add(content);
  } catch { /* no .gitignore */ }
  return ig;
}

async function fileExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function detectProductName(root: string): Promise<string | null> {
  // Try package.json
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    if (pkg.name && typeof pkg.name === "string") {
      const name = pkg.name.replace(/^@[^/]+\//, "");
      return toKebabCase(name) || null;
    }
  } catch { /* no package.json */ }

  // Try Cargo.toml
  try {
    const cargo = await readFile(join(root, "Cargo.toml"), "utf-8");
    const match = cargo.match(/name\s*=\s*"([^"]+)"/);
    if (match) return toKebabCase(match[1]) || null;
  } catch { /* no Cargo.toml */ }

  // Try pyproject.toml
  try {
    const pyproject = await readFile(join(root, "pyproject.toml"), "utf-8");
    const match = pyproject.match(/name\s*=\s*"([^"]+)"/);
    if (match) return toKebabCase(match[1]) || null;
  } catch { /* no pyproject.toml */ }

  // Try Gemfile (gem name from gemspec)
  try {
    const gemspecs = (await readdir(root)).filter(f => f.endsWith(".gemspec"));
    if (gemspecs.length > 0) {
      const content = await readFile(join(root, gemspecs[0]), "utf-8");
      const match = content.match(/\.name\s*=\s*["']([^"']+)["']/);
      if (match) return toKebabCase(match[1]) || null;
    }
  } catch { /* no gemspec */ }

  // Fallback to directory name
  return toKebabCase(basename(root)) || null;
}

async function detectProjectType(root: string): Promise<ProjectType> {
  // Swift / Xcode
  const entries = await readdir(root).catch(() => []);
  if (entries.some(e => e.endsWith(".xcodeproj") || e.endsWith(".xcworkspace"))) return "swift";
  if (await fileExists(join(root, "Package.swift"))) return "swift";

  // Next.js
  if (await fileExists(join(root, "next.config.js")) || await fileExists(join(root, "next.config.ts")) || await fileExists(join(root, "next.config.mjs"))) return "nextjs";

  // Rails
  if (await fileExists(join(root, "Gemfile")) && await fileExists(join(root, "config", "routes.rb"))) return "rails";

  // Django
  if (await fileExists(join(root, "manage.py"))) return "django";

  // Vue / Nuxt
  if (await fileExists(join(root, "nuxt.config.ts")) || await fileExists(join(root, "nuxt.config.js"))) return "vue";
  if (entries.some(e => e === "vue.config.js" || e === "vite.config.ts")) {
    // Check if it's Vue specifically
    try {
      const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
      if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return "vue";
    } catch { /* not vue */ }
  }

  // React (check after Next.js since Next is React-based)
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    if (pkg.dependencies?.react || pkg.devDependencies?.react) return "react";
  } catch { /* no package.json */ }

  // Go
  if (await fileExists(join(root, "go.mod"))) return "go";

  // Rust
  if (await fileExists(join(root, "Cargo.toml"))) return "rust";

  return "generic";
}

// ─── Framework-specific scanners ───

async function collectFiles(
  dir: string,
  ig: Ignore,
  root: string,
  extensions: Set<string>,
  maxDepth: number,
  depth = 0,
): Promise<string[]> {
  if (depth > maxDepth) return [];
  const results: string[] = [];

  try {
    const d = await opendir(dir);
    for await (const entry of d) {
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (isSensitive(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      const relPath = fullPath.slice(root.length + 1);

      if (ig.ignores(relPath)) continue;

      if (entry.isDirectory()) {
        const children = await collectFiles(fullPath, ig, root, extensions, maxDepth, depth + 1);
        results.push(...children);
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  } catch { /* can't read */ }

  return results;
}

async function scanSwift(root: string, ig: Ignore, verbose: boolean): Promise<{ areas: AreaToken[]; mermaid: string }> {
  const swiftFiles = await collectFiles(root, ig, root, new Set([".swift"]), 5);

  if (verbose) console.log(`Scanning ${swiftFiles.length} Swift files...`);

  // Analyze each file for type declarations, references, and complexity
  const nodes: FileNode[] = [];
  for (const file of swiftFiles) {
    const node = await analyzeSwiftFile(file);
    if (node) nodes.push(node);
  }

  if (verbose) console.log(`Analyzed ${nodes.length} view/controller files`);

  // Build dependency graph and walk from entry points
  const { roots } = buildGraph(nodes);

  if (verbose) {
    console.log(`Found ${roots.length} root nodes (entry points)`);
    for (const r of roots.slice(0, 5)) {
      console.log(`  ${r.typeName}: ${r.complexity.branches} branches, ${r.children.length} children`);
    }
  }

  // Generate mermaid from graph
  const productName = basename(root);
  const mermaid = graphToMermaid(toKebabCase(productName) || "app", roots);

  // Convert graph to PSL areas
  const graphAreas = graphToAreas(roots);
  const areas: AreaToken[] = graphAreas.map((a) => ({
    name: a.name,
    children: a.children,
    source: "view" as const,
  }));

  return { areas, mermaid };
}

async function scanReact(root: string, ig: Ignore, verbose: boolean): Promise<{ areas: AreaToken[]; mermaid: string }> {
  const extensions = new Set([".tsx", ".jsx"]);
  const componentFiles = await collectFiles(root, ig, root, extensions, 5);

  if (verbose) console.log(`Scanning ${componentFiles.length} React/TSX files...`);

  // Analyze each file
  const nodes: FileNode[] = [];
  for (const file of componentFiles) {
    const node = await analyzeReactFile(file);
    if (node) nodes.push(node);
  }

  if (verbose) console.log(`Analyzed ${nodes.length} component files`);

  // Build dependency graph
  const { roots } = buildGraph(nodes);

  if (verbose) {
    console.log(`Found ${roots.length} root components`);
    for (const r of roots.slice(0, 5)) {
      console.log(`  ${r.typeName}: ${r.complexity.branches} branches, ${r.children.length} children`);
    }
  }

  const productName = basename(root);
  const mermaid = graphToMermaid(toKebabCase(productName) || "app", roots);

  const graphAreas = graphToAreas(roots);
  const areas: AreaToken[] = graphAreas.map((a) => ({
    name: a.name,
    children: a.children,
    source: "component" as const,
  }));

  return { areas, mermaid };
}

async function scanNextjs(root: string, ig: Ignore, verbose: boolean): Promise<AreaToken[]> {
  // Next.js has app/ or pages/ directory as the primary routing structure
  const areas: AreaToken[] = [];

  // Scan app/ directory for route segments
  for (const routeDir of ["app", "src/app", "pages", "src/pages"]) {
    const fullPath = join(root, routeDir);
    if (!(await fileExists(fullPath))) continue;

    try {
      const d = await opendir(fullPath);
      for await (const entry of d) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name.startsWith("(")) continue;
        if (entry.name === "api") {
          // API routes are their own area
          areas.push({ name: "api", children: [], source: "directory" });
          continue;
        }

        const kebab = toKebabCase(entry.name);
        if (!kebab) continue;

        // Scan sub-routes
        const children: string[] = [];
        try {
          const subDir = await opendir(join(fullPath, entry.name));
          for await (const sub of subDir) {
            if (sub.isDirectory() && !sub.name.startsWith("_") && !sub.name.startsWith("(")) {
              const childKebab = toKebabCase(sub.name);
              if (childKebab) children.push(childKebab);
            }
          }
        } catch { /* can't read */ }

        areas.push({ name: kebab, children: children.slice(0, 15), source: "directory" });
      }
    } catch { /* can't read */ }
  }

  // Also scan components via graph analysis
  const componentResult = await scanReact(root, ig, verbose);
  areas.push(...componentResult.areas);

  return areas;
}

async function scanRails(root: string, ig: Ignore, verbose: boolean): Promise<AreaToken[]> {
  const areas: AreaToken[] = [];

  // Scan controllers for product areas
  const controllerDir = join(root, "app", "controllers");
  if (await fileExists(controllerDir)) {
    const files = await collectFiles(controllerDir, ig, root, new Set([".rb"]), 3);
    for (const file of files) {
      const base = basename(file, ".rb");
      if (base === "application_controller") continue;
      const semantic = stripSuffix(base, ["_controller"]);
      const kebab = toKebabCase(semantic);
      if (kebab && kebab.length > 1) {
        areas.push({ name: kebab, children: [], source: "controller" });
      }
    }
  }

  // Scan models for data areas
  const modelDir = join(root, "app", "models");
  if (await fileExists(modelDir)) {
    const files = await collectFiles(modelDir, ig, root, new Set([".rb"]), 2);
    const modelNames: string[] = [];
    for (const file of files) {
      const base = basename(file, ".rb");
      if (base === "application_record" || base === "concerns") continue;
      const kebab = toKebabCase(base);
      if (kebab && kebab.length > 1) modelNames.push(kebab);
    }

    // Add models as children of existing controller areas or as standalone
    for (const area of areas) {
      const related = modelNames.filter(m => area.name.includes(m) || m.includes(area.name));
      area.children.push(...related);
    }
  }

  if (verbose) console.log(`Found ${areas.length} Rails controllers`);
  return areas;
}

async function scanDjango(root: string, ig: Ignore, verbose: boolean): Promise<AreaToken[]> {
  const areas: AreaToken[] = [];

  // Find Django apps (directories with views.py)
  const pyFiles = await collectFiles(root, ig, root, new Set([".py"]), 3);
  const appDirs = new Set<string>();

  for (const file of pyFiles) {
    if (basename(file) === "views.py" || basename(file) === "models.py") {
      const parts = file.slice(root.length + 1).split("/");
      if (parts.length >= 2) {
        appDirs.add(parts[parts.length - 2]);
      }
    }
  }

  for (const dir of appDirs) {
    const kebab = toKebabCase(dir);
    if (kebab && kebab.length > 1) {
      areas.push({ name: kebab, children: [], source: "directory" });
    }
  }

  if (verbose) console.log(`Found ${areas.length} Django apps`);
  return areas;
}

async function scanGeneric(root: string, ig: Ignore, verbose: boolean): Promise<AreaToken[]> {
  const areas: AreaToken[] = [];

  // Only use top-level source directories, skip infrastructure
  const infraDirs = new Set([
    ...SKIP_DIRS, "docs", "scripts", "test", "tests", "spec", "specs",
    "config", "public", "static", "assets", "migrations", "fixtures",
    "tmp", "log", "logs", "bin", "lib", "pkg", "cmd",
  ]);

  try {
    const dir = await opendir(root);
    for await (const entry of dir) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (infraDirs.has(entry.name.toLowerCase())) continue;
      if (ig.ignores(entry.name + "/")) continue;

      const kebabName = toKebabCase(entry.name);
      if (!kebabName || kebabName.length < 2) continue;

      const children: string[] = [];
      try {
        const subDir = await opendir(join(root, entry.name));
        for await (const subEntry of subDir) {
          if (subEntry.name.startsWith(".")) continue;
          if (SKIP_DIRS.has(subEntry.name)) continue;
          if (subEntry.isDirectory()) {
            const childName = toKebabCase(subEntry.name);
            if (childName && childName.length > 1) children.push(childName);
          }
        }
      } catch { /* can't read */ }

      areas.push({
        name: kebabName,
        children: [...new Set(children)].slice(0, 10),
        source: "directory",
      });
    }
  } catch { /* can't read root */ }

  return areas;
}

// ─── Docs scanner ───

async function scanExistingDocs(
  root: string,
): Promise<{ vocabulary: Map<string, string[]> }> {
  const vocabulary = new Map<string, string[]>();

  const docPaths = [
    "CLAUDE.md", "AGENTS.md",
    "docs/design-system/vocabulary.md", "docs/vocabulary.md",
  ];

  for (const docPath of docPaths) {
    try {
      const content = await readFile(join(root, docPath), "utf-8");
      const boldTerms = content.matchAll(/\*\*([A-Za-z][A-Za-z0-9 -]+)\*\*/g);
      for (const match of boldTerms) {
        const term = toKebabCase(match[1]);
        if (term && term.length > 1 && term.length < 30) {
          if (!vocabulary.has(term)) vocabulary.set(term, []);
        }
      }
    } catch { /* file not found */ }
  }

  return { vocabulary };
}

// ─── Mermaid diagram generator ───

function generateMermaid(productName: string, areas: AreaToken[]): string {
  const lines: string[] = ["graph TD"];
  const root = productName.replace(/-/g, "_");
  lines.push(`  ${root}[${productName}]`);

  for (const area of areas) {
    const areaId = `${root}_${area.name.replace(/-/g, "_")}`;
    lines.push(`  ${root} --> ${areaId}[${area.name}]`);

    for (const child of area.children.slice(0, 8)) {
      const childId = `${areaId}_${child.replace(/-/g, "_")}`;
      lines.push(`  ${areaId} --> ${childId}[${child}]`);
    }
  }

  return lines.join("\n");
}

// ─── Main scan function ───

export async function scan(
  root: string,
  options: { git?: boolean; verbose?: boolean } = {},
): Promise<ScanResult> {
  await stat(root).catch(() => { throw new Error(`Path does not exist: ${root}`); });

  const ig = await loadGitignore(root);
  const productName = await detectProductName(root);
  const projectType = await detectProjectType(root);

  if (options.verbose) {
    console.log(`Scanning: ${root}`);
    console.log(`Product name: ${productName ?? "(unknown)"}`);
    console.log(`Project type: ${projectType}`);
  }

  // Use framework-specific scanner
  let areas: AreaToken[];
  let mermaid: string;
  const name = productName ?? "myapp";

  switch (projectType) {
    case "swift": {
      const result = await scanSwift(root, ig, !!options.verbose);
      areas = result.areas;
      mermaid = result.mermaid;
      break;
    }
    case "react": {
      const result = await scanReact(root, ig, !!options.verbose);
      areas = result.areas;
      mermaid = result.mermaid;
      break;
    }
    case "nextjs": {
      // Next.js: use graph analysis for components + route scanning
      const reactResult = await scanReact(root, ig, !!options.verbose);
      const routeAreas = await scanNextjs(root, ig, !!options.verbose);
      areas = [...routeAreas, ...reactResult.areas];
      mermaid = reactResult.mermaid || generateMermaid(name, areas);
      break;
    }
    case "rails": {
      areas = await scanRails(root, ig, !!options.verbose);
      mermaid = generateMermaid(name, areas);
      break;
    }
    case "django": {
      areas = await scanDjango(root, ig, !!options.verbose);
      mermaid = generateMermaid(name, areas);
      break;
    }
    default: {
      areas = await scanGeneric(root, ig, !!options.verbose);
      mermaid = generateMermaid(name, areas);
    }
  }

  // Also scan existing docs for vocabulary
  const docResult = await scanExistingDocs(root);

  // Default concerns
  const concerns = ["performance", "visual", "crash", "ux", "data", "lifecycle"];

  if (options.verbose) {
    console.log(`Found ${areas.length} areas`);
    console.log(`Vocabulary terms: ${docResult.vocabulary.size}`);
  }

  return {
    productName,
    projectType,
    areas,
    concerns,
    vocabulary: docResult.vocabulary,
    mermaid,
  };
}

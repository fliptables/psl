import { opendir, readFile, readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import ignore, { type Ignore } from "ignore";
import {
  analyzeSwiftFile,
  analyzeReactFile,
  analyzeGoFile,
  analyzeRustFile,
  analyzePythonFile,
  analyzeJavaFile,
  analyzeVueFile,
  analyzeRubyFile,
  buildGraph,
  graphToMermaid,
  graphToAreas,
  toKebab,
  type FileNode,
} from "./analyzer.js";

export interface AreaToken {
  name: string;
  children: string[];
}

export interface ScanResult {
  productName: string | null;
  projectType: ProjectType;
  areas: AreaToken[];
  concerns: string[];
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
  | "python"
  | "java"
  | "kotlin"
  | "ruby"
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
      return toKebab(name) || null;
    }
  } catch { /* no package.json */ }

  // Try Cargo.toml
  try {
    const cargo = await readFile(join(root, "Cargo.toml"), "utf-8");
    const match = cargo.match(/name\s*=\s*"([^"]+)"/);
    if (match) return toKebab(match[1]) || null;
  } catch { /* no Cargo.toml */ }

  // Try pyproject.toml
  try {
    const pyproject = await readFile(join(root, "pyproject.toml"), "utf-8");
    const match = pyproject.match(/name\s*=\s*"([^"]+)"/);
    if (match) return toKebab(match[1]) || null;
  } catch { /* no pyproject.toml */ }

  // Try Xcode project name
  try {
    const entries = await readdir(root);
    const xcodeproj = entries.find(e => e.endsWith(".xcodeproj"));
    if (xcodeproj) {
      const name = xcodeproj.replace(/\.xcodeproj$/, "");
      return toKebab(name) || null;
    }
  } catch { /* no xcodeproj */ }

  // Try gemspec
  try {
    const entries = await readdir(root);
    const gemspecs = entries.filter(f => f.endsWith(".gemspec"));
    if (gemspecs.length > 0) {
      const content = await readFile(join(root, gemspecs[0]), "utf-8");
      const match = content.match(/\.name\s*=\s*["']([^"']+)["']/);
      if (match) return toKebab(match[1]) || null;
    }
  } catch { /* no gemspec */ }

  // Fallback to directory name
  return toKebab(basename(root)) || null;
}

async function detectProjectType(root: string): Promise<ProjectType> {
  const entries = await readdir(root).catch(() => []);

  // Swift / Xcode
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
    try {
      const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
      if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return "vue";
    } catch { /* not vue */ }
  }

  // React
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    if (pkg.dependencies?.react || pkg.devDependencies?.react) return "react";
  } catch { /* no package.json */ }

  // Go
  if (await fileExists(join(root, "go.mod"))) return "go";

  // Rust
  if (await fileExists(join(root, "Cargo.toml"))) return "rust";

  // Java / Kotlin
  if (await fileExists(join(root, "build.gradle")) || await fileExists(join(root, "build.gradle.kts")) || await fileExists(join(root, "pom.xml"))) {
    const hasKotlin = entries.some(e => e === "build.gradle.kts") || await fileExists(join(root, "src", "main", "kotlin"));
    return hasKotlin ? "kotlin" : "java";
  }

  // Ruby (non-Rails)
  if (await fileExists(join(root, "Gemfile")) || entries.some(e => e.endsWith(".gemspec"))) return "ruby";

  // Python (non-Django)
  if (await fileExists(join(root, "pyproject.toml")) || await fileExists(join(root, "setup.py")) || await fileExists(join(root, "requirements.txt"))) return "python";

  return "generic";
}

// ─── File collection ───

const MAX_FILES = 800;

async function collectFiles(
  dir: string,
  ig: Ignore,
  root: string,
  extensions: Set<string>,
  maxDepth: number,
  depth = 0,
  results: string[] = [],
): Promise<string[]> {
  if (depth > maxDepth || results.length >= MAX_FILES) return results;

  try {
    const d = await opendir(dir);
    for await (const entry of d) {
      if (results.length >= MAX_FILES) break;
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (isSensitive(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      const relPath = fullPath.slice(root.length + 1);
      if (ig.ignores(relPath)) continue;

      if (entry.isDirectory()) {
        await collectFiles(fullPath, ig, root, extensions, maxDepth, depth + 1, results);
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  } catch { /* can't read */ }

  return results;
}

// ─── Parallel file analysis ───

async function analyzeFilesParallel<T>(
  files: string[],
  analyze: (path: string) => Promise<T | null>,
  concurrency = 16,
): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (i < files.length) {
      const file = files[i++];
      const result = await analyze(file);
      if (result) results.push(result);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Graph-based scanner (shared across all graph-analyzed languages) ───

interface GraphScanResult {
  areas: AreaToken[];
  mermaid: string;
}

async function scanWithGraph(
  root: string,
  ig: Ignore,
  verbose: boolean,
  extensions: Set<string>,
  analyzer: (path: string) => Promise<FileNode | null>,
  label: string,
  maxDepth = 5,
): Promise<GraphScanResult> {
  const files = await collectFiles(root, ig, root, extensions, maxDepth);
  if (verbose) console.log(`Scanning ${files.length} ${label} files...`);

  const nodes = await analyzeFilesParallel(files, analyzer);
  if (verbose) console.log(`Analyzed ${nodes.length} ${label} types`);

  const { roots } = buildGraph(nodes);

  if (verbose) {
    console.log(`Found ${roots.length} root nodes`);
    for (const r of roots.slice(0, 5)) {
      console.log(`  ${r.typeName}: ${r.complexity.branches} branches, ${r.children.length} children`);
    }
  }

  const productName = toKebab(basename(root)) || "app";
  const mermaid = graphToMermaid(productName, roots);
  const graphAreas = graphToAreas(roots);

  return {
    areas: graphAreas.map((a) => ({ name: a.name, children: a.children })),
    mermaid,
  };
}

// ─── Next.js route scanner (routes only, no component analysis) ───

async function scanNextjsRoutes(root: string, ig: Ignore, verbose: boolean): Promise<AreaToken[]> {
  const areas: AreaToken[] = [];

  for (const routeDir of ["app", "src/app", "pages", "src/pages"]) {
    const fullPath = join(root, routeDir);
    if (!(await fileExists(fullPath))) continue;

    try {
      const d = await opendir(fullPath);
      for await (const entry of d) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name.startsWith("(")) continue;

        if (entry.name === "api") {
          areas.push({ name: "api", children: [] });
          continue;
        }

        const kebab = toKebab(entry.name);
        if (!kebab) continue;

        const children: string[] = [];
        try {
          const subDir = await opendir(join(fullPath, entry.name));
          for await (const sub of subDir) {
            if (sub.isDirectory() && !sub.name.startsWith("_") && !sub.name.startsWith("(")) {
              const childKebab = toKebab(sub.name);
              if (childKebab) children.push(childKebab);
            }
          }
        } catch { /* can't read */ }

        areas.push({ name: kebab, children: children.slice(0, 15) });
      }
    } catch { /* can't read */ }
  }

  if (verbose) console.log(`Found ${areas.length} Next.js routes`);
  return areas;
}

// ─── Generic directory scanner (fallback) ───

async function scanGeneric(root: string, ig: Ignore, verbose: boolean): Promise<GraphScanResult> {
  const areas: AreaToken[] = [];

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

      const kebabName = toKebab(entry.name);
      if (!kebabName || kebabName.length < 2) continue;

      const children: string[] = [];
      try {
        const subDir = await opendir(join(root, entry.name));
        for await (const subEntry of subDir) {
          if (subEntry.name.startsWith(".")) continue;
          if (SKIP_DIRS.has(subEntry.name)) continue;
          if (subEntry.isDirectory()) {
            const childName = toKebab(subEntry.name);
            if (childName && childName.length > 1) children.push(childName);
          }
        }
      } catch { /* can't read */ }

      areas.push({
        name: kebabName,
        children: [...new Set(children)].slice(0, 10),
      });
    }
  } catch { /* can't read root */ }

  // Generate flat mermaid for generic projects
  const productName = toKebab(basename(root)) || "app";
  const lines: string[] = ["graph TD"];
  const rootId = productName.replace(/-/g, "_");
  lines.push(`  ${rootId}[${productName}]`);
  for (const area of areas) {
    const areaId = `${rootId}_${area.name.replace(/-/g, "_")}`;
    lines.push(`  ${rootId} --> ${areaId}[${area.name}]`);
    for (const child of area.children.slice(0, 8)) {
      const childId = `${areaId}_${child.replace(/-/g, "_")}`;
      lines.push(`  ${areaId} --> ${childId}[${child}]`);
    }
  }

  return { areas, mermaid: lines.join("\n") };
}

// ─── Main scan function ───

export async function scan(
  root: string,
  options: { verbose?: boolean } = {},
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

  const verbose = !!options.verbose;
  let result: GraphScanResult;

  switch (projectType) {
    case "swift":
      result = await scanWithGraph(root, ig, verbose, new Set([".swift"]), analyzeSwiftFile, "Swift");
      break;
    case "react":
      result = await scanWithGraph(root, ig, verbose, new Set([".tsx", ".jsx"]), analyzeReactFile, "React");
      break;
    case "nextjs": {
      const reactResult = await scanWithGraph(root, ig, verbose, new Set([".tsx", ".jsx"]), analyzeReactFile, "React");
      const routeAreas = await scanNextjsRoutes(root, ig, verbose);
      result = {
        areas: [...routeAreas, ...reactResult.areas],
        mermaid: reactResult.mermaid,
      };
      break;
    }
    case "rails":
    case "ruby":
      result = await scanWithGraph(root, ig, verbose, new Set([".rb"]), analyzeRubyFile, "Ruby");
      break;
    case "django":
    case "python":
      result = await scanWithGraph(root, ig, verbose, new Set([".py"]), analyzePythonFile, "Python");
      break;
    case "go":
      result = await scanWithGraph(root, ig, verbose, new Set([".go"]), analyzeGoFile, "Go");
      break;
    case "rust":
      result = await scanWithGraph(root, ig, verbose, new Set([".rs"]), analyzeRustFile, "Rust");
      break;
    case "java":
    case "kotlin":
      result = await scanWithGraph(root, ig, verbose, new Set([".java", ".kt"]), analyzeJavaFile, "Java/Kotlin", 6);
      break;
    case "vue":
      result = await scanWithGraph(root, ig, verbose, new Set([".vue", ".ts", ".tsx"]), (path) => {
        return extname(path) === ".vue" ? analyzeVueFile(path) : analyzeReactFile(path);
      }, "Vue");
      break;
    default:
      result = await scanGeneric(root, ig, verbose);
  }

  const concerns = ["performance", "visual", "crash", "ux", "data", "lifecycle"];

  if (options.verbose) {
    console.log(`Found ${result.areas.length} areas`);
  }

  return {
    productName,
    projectType,
    areas: result.areas,
    concerns,
    mermaid: result.mermaid,
  };
}

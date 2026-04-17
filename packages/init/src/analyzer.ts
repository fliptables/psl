import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { toKebab, stripSuffix } from "@psl/core";

export { toKebab, stripSuffix };

export interface FileNode {
  /** Absolute path */
  path: string;
  /** Semantic name (kebab-case, suffix stripped) */
  name: string;
  /** Original type name as it appears in code */
  typeName: string;
  /** Files this file references */
  references: string[];
  /** Complexity metrics */
  complexity: {
    lines: number;
    branches: number;
    depth: number;
    references: number;
  };
}

export interface GraphNode {
  name: string;
  typeName: string;
  path: string;
  complexity: FileNode["complexity"];
  children: GraphNode[];
  /** How many other files reference this one */
  inDegree: number;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Count lines without allocating a full line array */
function countLines(content: string): number {
  return (content.match(/\n/g)?.length ?? 0) + 1;
}

function countPatterns(content: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    const matches = content.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

/** Brace-based nesting depth (C-style languages) */
function maxNestingDepth(content: string): number {
  let max = 0;
  let current = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c === 123) { if (++current > max) max = current; } // {
    else if (c === 125) current--;                          // }
  }
  return max;
}

/** Indentation-based depth (Python, Ruby) */
function maxIndentDepth(content: string): number {
  let max = 0;
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    const spaces = line.match(/^(\s*)/)?.[1].length ?? 0;
    const depth = Math.floor(spaces / 2);
    if (depth > max) max = depth;
  }
  return max;
}

const MAX_FILE_SIZE = 100_000; // skip files over 100KB (generated/vendored)

async function readSource(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, "utf-8");
    if (content.length > MAX_FILE_SIZE) return null;
    return content;
  } catch {
    return null;
  }
}

// ─── Per-language suffix lists ───

const SWIFT_SUFFIXES = [
  "ViewController", "OutlineView", "SplitView", "EditorView",
  "PanelView", "BrowserView", "ListView", "TreeView", "CardView",
  "DetailView", "PickerView", "BarView", "PopoverView", "SheetView",
  "OverlayView", "ToolbarView", "HeaderView", "FooterView",
  "View", "Controller",
];

const REACT_SUFFIXES = [
  "Component", "Container", "Provider", "Layout", "Page", "Modal",
  "Dialog", "Drawer", "Panel", "Widget", "Card", "List", "Form",
  "Sidebar", "Header", "Footer", "Toolbar",
];

const PYTHON_SUFFIXES = [
  "ViewSet", "View", "Serializer", "Model", "Form", "Admin", // ViewSet before View
  "Manager", "Mixin", "Middleware", "Command", "Task", "Handler",
  "Service", "Repository", "Factory", "Builder",
];

const JAVA_SUFFIXES = [
  "Controller", "ServiceImpl", "Service", "RepositoryImpl", "Repository",
  "Component", "Configuration", "Config", "Factory", "Builder",
  "Handler", "Listener", "Interceptor", "Filter", "Adapter",
  "Converter", "Mapper", "DTO", "Entity", "Model",
  "Activity", "Fragment", "ViewModel", "Presenter",
];

const RUBY_SUFFIXES = [
  "Controller", "Model", "Mailer", "Job", "Worker",
  "Service", "Serializer", "Decorator", "Presenter",
  "Policy", "Form", "Query", "Validator",
];

// ─── Per-language branch patterns (pre-compiled) ───

const SWIFT_BRANCHES = [/\bif\b/g, /\bswitch\b/g, /\bguard\b/g, /\belse\b/g, /\bcase\b/g, /\bfor\b/g, /\?\s*[^?]/g];
const REACT_BRANCHES = [/\bif\s*\(/g, /\bswitch\s*\(/g, /\?\s*[^?:]/g, /&&\s*</g, /\?\?\s/g];
const GO_BRANCHES = [/\bif\b/g, /\bswitch\b/g, /\bcase\b/g, /\belse\b/g, /\bfor\b/g, /\bselect\b/g];
const RUST_BRANCHES = [/\bif\b/g, /\bmatch\b/g, /\belse\b/g, /\bloop\b/g, /\bfor\b/g, /\bwhile\b/g, /=>\s/g];
const PYTHON_BRANCHES = [/\bif\b/g, /\belif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g, /\bexcept\b/g, /\btry\b/g];
const JAVA_BRANCHES = [/\bif\s*\(/g, /\bswitch\s*\(/g, /\bcase\b/g, /\belse\b/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bcatch\s*\(/g, /\bwhen\s*[({]/g];
const VUE_BRANCHES = [/\bv-if\b/g, /\bv-else-if\b/g, /\bv-else\b/g, /\bv-for\b/g, /\bif\s*\(/g, /\bswitch\s*\(/g, /\?\s*[^?:]/g];
const RUBY_BRANCHES = [/\bif\b/g, /\belsif\b/g, /\belse\b/g, /\bunless\b/g, /\bcase\b/g, /\bwhen\b/g, /\brescue\b/g];

// ─── Per-language blocklists for reference noise filtering ───

const GO_BLOCKLIST = new Set(["TODO", "FIXME", "NOTE", "HTTP", "JSON", "UUID", "API", "URL", "SQL", "EOF", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "Context", "WaitGroup", "Mutex", "RWMutex", "Duration", "Time", "Logger", "Reader", "Writer", "Buffer", "Closer"]);
const RUST_BLOCKLIST = new Set(["String", "Vec", "Option", "Result", "Box", "Arc", "Mutex", "HashMap", "HashSet", "BTreeMap", "BTreeSet", "None", "Some", "Ok", "Err", "Self", "Send", "Sync", "Clone", "Debug", "Display", "Default", "Error", "From", "Into", "PathBuf", "OsStr", "OsString", "Bytes", "Duration", "Instant", "AtomicUsize", "AtomicBool", "PhantomData", "NonNull", "Ordering", "CString", "Cow", "Pin", "Future", "Stream", "Iterator"]);
const PYTHON_BLOCKLIST = new Set(["True", "False", "None", "Exception", "TypeError", "ValueError", "KeyError", "AttributeError", "NotImplementedError", "RuntimeError", "OSError", "IOError", "ImportError", "IndexError", "StopIteration", "FileNotFoundError", "PermissionError", "ConnectionError", "TimeoutError"]);
const JAVA_BLOCKLIST = new Set(["String", "Integer", "Boolean", "Double", "Float", "Long", "Object", "List", "Map", "Set", "Array", "HashMap", "ArrayList", "Optional", "Stream", "Override", "Nullable", "NonNull", "Autowired", "Component", "Service", "Controller", "Repository", "Entity", "Table", "Column", "Inject", "Singleton", "Module", "Bean", "Value", "Primary", "Qualifier", "Scope", "Lazy", "PostConstruct", "PreDestroy"]);
const RUBY_BLOCKLIST = new Set(["ActiveRecord", "ApplicationRecord", "ApplicationController", "ActionController", "ActiveModel", "ActiveSupport", "ActiveJob", "ActionMailer", "Rails", "Devise", "Pundit", "Sidekiq", "Redis", "Logger", "Integer", "String", "Array", "Hash", "Float", "Symbol", "Proc", "Thread", "Mutex", "OpenStruct", "Struct", "Enumerable", "Comparable", "Kernel", "Module", "Class", "Object", "NilClass", "TrueClass", "FalseClass", "StandardError", "RuntimeError", "ArgumentError", "TypeError", "NameError", "NoMethodError", "NotImplementedError"]);

// ─── Swift analyzer ───

const SWIFT_VIEW_PATTERN = /(?:struct|class)\s+(\w+)\s*:\s*[^{]*(?:View|Scene|App|NSViewControllerRepresentable|NSViewRepresentable)\b/g;
const SWIFT_REFERENCE_PATTERN = /\b([A-Z][A-Za-z0-9]+(?:View|Controller|SplitView|Panel|Bar|Sheet|Overlay|Picker|Card|Editor|Browser|Inspector|Terminal|Dashboard|Sidebar))\b/g;

export async function analyzeSwiftFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  // Find the primary type declared in this file
  const typeMatches = [...content.matchAll(SWIFT_VIEW_PATTERN)];
  if (typeMatches.length === 0) {
    // Fallback: non-capturing group for keyword, capture only the name
    const classMatch = content.match(/(?:struct|class)\s+(\w+(?:View|Controller|SplitView))\b/);
    if (!classMatch || !classMatch[1]) return null;
    typeMatches.push(classMatch as RegExpExecArray);
  }

  const typeName = typeMatches[0][1];
  const name = toKebab(stripSuffix(typeName, SWIFT_SUFFIXES));
  if (!name) return null;

  const refs = new Set<string>();
  for (const match of content.matchAll(SWIFT_REFERENCE_PATTERN)) {
    const ref = match[1];
    if (ref !== typeName) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, SWIFT_BRANCHES);
  const depth = maxNestingDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── React/TSX analyzer ───

const TSX_COMPONENT_PATTERN = /(?:export\s+(?:default\s+)?)?(?:function|const)\s+([A-Z][a-z][A-Za-z0-9]*)/g;
const TSX_JSX_PATTERN = /<([A-Z][A-Za-z0-9]+)/g;

/** Check if a name is ALL_CAPS (constant/enum, not a component) */
function isAllCaps(name: string): boolean {
  return name === name.toUpperCase() && name.length > 1;
}

export async function analyzeReactFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const base = basename(path);
  const ext = extname(path);
  if (base.includes(".test.") || base.includes(".spec.") || base.includes(".stories.")) return null;

  // For index files, derive the component name from the parent directory
  const isIndex = base === "index.tsx" || base === "index.jsx" || base === "index.js";

  // Verify this file actually contains JSX (important for .js files)
  if (ext === ".js" && !content.includes("<") && !content.includes("React.createElement")) return null;

  const componentMatches = [...content.matchAll(TSX_COMPONENT_PATTERN)]
    .filter(m => !isAllCaps(m[1]));
  if (componentMatches.length === 0) return null;

  let typeName = componentMatches[0][1];

  // For index files, prefer the parent directory name as the component name
  if (isIndex) {
    const dir = basename(path.replace(/\/[^/]+$/, ""));
    if (dir && /^[A-Z]/.test(dir)) {
      typeName = dir;
    }
  }

  const name = toKebab(stripSuffix(typeName, REACT_SUFFIXES));
  if (!name) return null;

  const refs = new Set<string>();
  for (const match of content.matchAll(TSX_JSX_PATTERN)) {
    const ref = match[1];
    if (ref !== typeName) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, REACT_BRANCHES);
  const depth = maxNestingDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Go analyzer ───

export async function analyzeGoFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const base = basename(path, ".go");
  if (base === "main" || base.endsWith("_test")) return null;

  const pkgMatch = content.match(/^package\s+(\w+)/m);
  if (!pkgMatch) return null;

  const typeMatches = [...content.matchAll(/type\s+([A-Z]\w+)\s+(?:struct|interface)\b/g)];
  const typeName = typeMatches[0]?.[1] ?? capitalize(base);
  const name = toKebab(typeName);
  if (!name) return null;

  const refs = new Set<string>();
  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) {
    const ref = match[1];
    if (ref !== typeName && !GO_BLOCKLIST.has(ref)) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, GO_BRANCHES);
  const depth = maxNestingDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Rust analyzer ───

export async function analyzeRustFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const base = basename(path, ".rs");
  if (base === "mod" || base === "lib" || base === "main" || base.endsWith("_test")) return null;

  const typeMatches = [...content.matchAll(/pub\s+(?:struct|enum|trait)\s+(\w+)/g)];
  const typeName = typeMatches[0]?.[1] ?? capitalize(base);
  const name = toKebab(typeName);
  if (!name) return null;

  const refs = new Set<string>();
  for (const match of content.matchAll(/use\s+(?:crate|super)::(\w+)/g)) {
    refs.add(capitalize(match[1]));
  }
  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) {
    const ref = match[1];
    if (ref !== typeName && !RUST_BLOCKLIST.has(ref)) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, RUST_BRANCHES);
  const depth = maxNestingDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Python analyzer ───

export async function analyzePythonFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const base = basename(path, ".py");
  if (base.startsWith("test_") || base.endsWith("_test") || base === "__init__" || base === "conftest" || base === "setup" || base === "manage") return null;

  const classMatches = [...content.matchAll(/class\s+([A-Z]\w+)/g)];
  const typeName = classMatches[0]?.[1] ?? capitalize(base);
  const name = toKebab(stripSuffix(typeName, PYTHON_SUFFIXES));
  if (!name) return null;

  const refs = new Set<string>();
  // Relative imports: from .models import User → User
  for (const match of content.matchAll(/from\s+\.\w*\s+import\s+(\w+)/g)) {
    refs.add(match[1]);
  }
  // Uppercase identifiers (skip stdlib)
  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) {
    const ref = match[1];
    if (ref !== typeName && !PYTHON_BLOCKLIST.has(ref)) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, PYTHON_BRANCHES);
  const depth = maxIndentDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Java/Kotlin analyzer ───

export async function analyzeJavaFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const ext = extname(path);
  const base = basename(path, ext);
  if (base.endsWith("Test") || base.endsWith("Tests") || base.endsWith("Spec")) return null;

  const classPattern = ext === ".kt"
    ? /(?:class|interface|object)\s+(\w+)/g
    : /(?:public\s+)?(?:class|interface|enum)\s+(\w+)/g;
  const typeMatches = [...content.matchAll(classPattern)];
  const typeName = typeMatches[0]?.[1] ?? base;
  const name = toKebab(stripSuffix(typeName, JAVA_SUFFIXES));
  if (!name) return null;

  const refs = new Set<string>();
  // Java imports (with semicolons)
  for (const match of content.matchAll(/import\s+[\w.]+\.([A-Z]\w+)\s*;/g)) {
    refs.add(match[1]);
  }
  // Kotlin imports (no semicolons)
  for (const match of content.matchAll(/import\s+[\w.]+\.([A-Z]\w+)\s*$/gm)) {
    refs.add(match[1]);
  }
  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) {
    const ref = match[1];
    if (ref !== typeName && !JAVA_BLOCKLIST.has(ref)) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, JAVA_BRANCHES);
  const depth = maxNestingDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Vue SFC analyzer ───

export async function analyzeVueFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const base = basename(path, ".vue");
  if (base.endsWith(".test") || base.endsWith(".spec") || base.endsWith(".stories")) return null;

  const typeName = capitalize(base);
  const name = toKebab(base);
  if (!name) return null;

  const refs = new Set<string>();
  // PascalCase components in template
  for (const match of content.matchAll(/<([A-Z][A-Za-z0-9]+)/g)) {
    if (match[1] !== typeName) refs.add(match[1]);
  }
  // kebab-case components in template → convert to PascalCase
  for (const match of content.matchAll(/<([a-z][a-z0-9]+-[a-z0-9-]+)/g)) {
    const pascal = match[1].split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    refs.add(pascal);
  }
  // Script imports
  for (const match of content.matchAll(/import\s+(?:\{[^}]*\}|(\w+))\s+from\s+["']([^"']+)["']/g)) {
    if (match[1] && /^[A-Z]/.test(match[1])) refs.add(match[1]);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, VUE_BRANCHES);
  const depth = maxNestingDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Ruby/Rails analyzer ───

export async function analyzeRubyFile(path: string): Promise<FileNode | null> {
  const content = await readSource(path);
  if (!content) return null;

  const base = basename(path, ".rb");
  if (base.endsWith("_test") || base.endsWith("_spec") || base === "application_controller" || base === "application_record" || base === "application_helper") return null;

  const classMatches = [...content.matchAll(/class\s+(\w+)/g)];
  const moduleMatches = [...content.matchAll(/module\s+(\w+)/g)];
  const typeName = classMatches[0]?.[1] ?? moduleMatches[0]?.[1] ?? capitalize(base);
  const name = toKebab(stripSuffix(typeName, RUBY_SUFFIXES));
  if (!name) return null;

  const refs = new Set<string>();
  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) {
    const ref = match[1];
    if (ref !== typeName && !RUBY_BLOCKLIST.has(ref)) refs.add(ref);
  }

  const lines = countLines(content);
  const branches = countPatterns(content, RUBY_BRANCHES);
  const depth = maxIndentDepth(content);

  return {
    path, name, typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Graph builder ───

/** Patterns that indicate a utility/leaf component, not a product area */
const LEAF_PATTERNS = [
  /button$/i,
  /^icon/i,
  /^micro/i,
  /^tag$/i,
  /monitor$/i,
  /handler$/i,
  /helper$/i,
  /util/i,
  /extension$/i,
  /wrapper$/i,
  /^divider$/i,
  /^separator$/i,
  /^spacer$/i,
  /cursor$/i,
  /animation$/i,
  /^dot$/i,
  /^badge$/i,
  /^avatar$/i,
  /^tooltip$/i,
  /^spinner$/i,
  /^loader$/i,
  /^skeleton$/i,
  /^overlay$/i,
  /^backdrop$/i,
  /^chevron/i,
  /^arrow/i,
  /^check$/i,
  /^close$/i,
  /^empty-state/i,
];

function isInfrastructure(name: string, typeName: string): boolean {
  for (const p of LEAF_PATTERNS) {
    if (p.test(typeName) || p.test(name)) return true;
  }
  return false;
}

export function buildGraph(nodes: FileNode[]): {
  roots: GraphNode[];
} {
  const byTypeName = new Map<string, FileNode>();
  for (const node of nodes) {
    byTypeName.set(node.typeName, node);
  }

  const inDegrees = new Map<string, number>();
  for (const node of nodes) {
    if (!inDegrees.has(node.typeName)) inDegrees.set(node.typeName, 0);
    for (const ref of node.references) {
      if (byTypeName.has(ref)) {
        inDegrees.set(ref, (inDegrees.get(ref) ?? 0) + 1);
      }
    }
  }

  const graphNodes = new Map<string, GraphNode>();
  const visited = new Set<string>();

  // Note: if a cycle exists (A→B→A), the second visit returns the partially-built
  // node (children may be incomplete). This is intentional cycle-breaking.
  function toGraphNode(typeName: string): GraphNode | null {
    if (visited.has(typeName)) return graphNodes.get(typeName) ?? null;
    visited.add(typeName);

    const fileNode = byTypeName.get(typeName);
    if (!fileNode) return null;

    const gn: GraphNode = {
      name: fileNode.name,
      typeName: fileNode.typeName,
      path: fileNode.path,
      complexity: fileNode.complexity,
      children: [],
      inDegree: inDegrees.get(typeName) ?? 0,
    };
    graphNodes.set(typeName, gn);

    for (const ref of fileNode.references) {
      const refNode = byTypeName.get(ref);
      if (!refNode) continue;
      // Use the ref's kebab name for infrastructure check — no language-specific stripping
      if (isInfrastructure(toKebab(ref), ref)) continue;

      const child = toGraphNode(ref);
      if (child) gn.children.push(child);
    }

    gn.children.sort(
      (a, b) =>
        b.complexity.references + b.complexity.branches -
        (a.complexity.references + a.complexity.branches),
    );

    return gn;
  }

  for (const node of nodes) {
    toGraphNode(node.typeName);
  }

  // Find entry points
  const appEntries = [...graphNodes.values()].filter(
    (n) =>
      n.typeName.endsWith("App") ||
      n.typeName.endsWith("Scene") ||
      n.typeName === "ContentView",
  );

  const layoutRoots = [...graphNodes.values()]
    .filter((n) => n.children.length >= 3 && !isInfrastructure(n.name, n.typeName))
    .sort((a, b) => b.children.length - a.children.length);

  const rootSet = new Set<string>();
  const roots: GraphNode[] = [];

  for (const entry of appEntries) {
    if (!rootSet.has(entry.typeName)) {
      rootSet.add(entry.typeName);
      roots.push(entry);
    }
  }

  for (const layout of layoutRoots.slice(0, 5)) {
    if (!rootSet.has(layout.typeName)) {
      const isChild = roots.some((r) =>
        r.children.some((c) => c.typeName === layout.typeName),
      );
      if (!isChild) {
        rootSet.add(layout.typeName);
        roots.push(layout);
      }
    }
  }

  const orphans = [...graphNodes.values()].filter(
    (n) =>
      n.inDegree === 0 &&
      !rootSet.has(n.typeName) &&
      !isInfrastructure(n.name, n.typeName) &&
      (n.children.length > 0 || n.complexity.branches >= 10),
  );
  for (const orphan of orphans.slice(0, 5)) {
    rootSet.add(orphan.typeName);
    roots.push(orphan);
  }

  roots.sort((a, b) => {
    const aIsApp = a.typeName.endsWith("App") ? 1 : 0;
    const bIsApp = b.typeName.endsWith("App") ? 1 : 0;
    if (aIsApp !== bIsApp) return bIsApp - aIsApp;
    return (
      b.complexity.references + b.complexity.branches + b.children.length * 5 -
      (a.complexity.references + a.complexity.branches + a.children.length * 5)
    );
  });

  return { roots };
}

// ─── Mermaid from graph ───

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

export function graphToMermaid(
  productName: string,
  roots: GraphNode[],
  maxDepth = 3,
): string {
  const lines: string[] = ["graph TD"];
  const rootId = sanitizeId(productName);
  lines.push(`  ${rootId}["${productName}"]`);

  const emitted = new Set<string>();

  function emit(parent: string, node: GraphNode, depth: number) {
    const nodeId = sanitizeId(node.typeName);
    if (emitted.has(`${parent}-${nodeId}`)) return;
    emitted.add(`${parent}-${nodeId}`);

    const complexityTag =
      node.complexity.branches > 15
        ? "🔴"
        : node.complexity.branches > 5
          ? "🟡"
          : "";

    lines.push(
      `  ${parent} --> ${nodeId}["${node.name}${complexityTag}"]`,
    );

    if (depth < maxDepth) {
      for (const child of node.children.slice(0, 8)) {
        emit(nodeId, child, depth + 1);
      }
    }
  }

  for (const root of roots) {
    emit(rootId, root, 1);
  }

  return lines.join("\n");
}

// ─── Graph to PSL areas ───

function collectDescendants(node: GraphNode, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return [];
  const names: string[] = [];
  for (const child of node.children) {
    if (!isInfrastructure(child.name, child.typeName)) {
      names.push(child.name);
      names.push(...collectDescendants(child, depth + 1, maxDepth));
    }
  }
  return names;
}

const MIN_AREA_COMPLEXITY = 15;
const MIN_AREA_CHILDREN = 2;
const MAX_AREA_COMPLEXITY_LEAF = 30;
const MAX_AREAS = 15;

export function graphToAreas(roots: GraphNode[]): {
  name: string;
  children: string[];
  complexity: number;
}[] {
  const areas: { name: string; children: string[]; complexity: number }[] = [];
  const seen = new Set<string>();

  const isAppEntry = (n: GraphNode) =>
    n.typeName.endsWith("App") || n.typeName === "ContentView";

  // Layout containers and app entries: promote children, skip the container itself
  const sorted = [...roots].sort((a, b) => b.children.length - a.children.length);

  let promotedContainers = 0;
  for (const root of sorted) {
    if (seen.has(root.name)) continue;

    const shouldPromote = isAppEntry(root) || (root.children.length >= 4 && promotedContainers < 3);

    if (shouldPromote) {
      seen.add(root.name);
      promotedContainers++;

      for (const child of root.children) {
        if (seen.has(child.name)) continue;
        if (isInfrastructure(child.name, child.typeName)) continue;

        const totalComplexity = child.complexity.branches + child.complexity.references;
        if (totalComplexity < MIN_AREA_COMPLEXITY && child.children.length < MIN_AREA_CHILDREN) continue;

        seen.add(child.name);

        const descendants = [...new Set(collectDescendants(child, 0, 2))]
          .filter((d) => !seen.has(d))
          .slice(0, 10);

        areas.push({
          name: child.name,
          children: descendants,
          complexity: totalComplexity + child.children.length * 3,
        });
      }
    } else {
      if (root.children.length === 0 && root.complexity.branches < 10) continue;

      seen.add(root.name);
      const descendants = [...new Set(collectDescendants(root, 0, 2))]
        .filter((d) => !seen.has(d))
        .slice(0, 10);

      areas.push({
        name: root.name,
        children: descendants,
        complexity:
          root.complexity.branches + root.complexity.references + root.children.length * 3,
      });
    }
  }

  areas.sort((a, b) => b.complexity - a.complexity);

  const filtered = areas.filter(
    (a) => a.children.length > 0 || a.complexity >= MAX_AREA_COMPLEXITY_LEAF,
  );

  // Deduplicate children across areas
  const areaNames = new Set(filtered.map((a) => a.name));
  const globalSeen = new Set<string>();
  for (const area of filtered) {
    area.children = area.children
      .filter((c) => !areaNames.has(c))
      .filter((c) => {
        if (globalSeen.has(c)) return false;
        globalSeen.add(c);
        return true;
      });
  }

  return filtered.slice(0, MAX_AREAS);
}

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

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
    branches: number; // if/switch/guard/ternary — proxy for cyclomatic complexity
    depth: number; // max nesting depth
    references: number; // how many other views/components this file uses
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

// ─── Swift analyzer ───

const SWIFT_VIEW_PATTERN = /(?:struct|class)\s+(\w+)\s*:\s*[^{]*(?:View|Scene|App|NSViewControllerRepresentable|NSViewRepresentable)\b/g;
const SWIFT_REFERENCE_PATTERN = /\b([A-Z][A-Za-z0-9]+(?:View|Controller|SplitView|Panel|Bar|Sheet|Overlay|Picker|Card|Editor|Browser|Inspector|Terminal|Dashboard|Sidebar))\b/g;

export async function analyzeSwiftFile(path: string): Promise<FileNode | null> {
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return null;
  }

  // Find the primary type declared in this file
  const typeMatches = [...content.matchAll(SWIFT_VIEW_PATTERN)];
  if (typeMatches.length === 0) {
    // Also check for classes that might be view-related
    const classMatch = content.match(/(?:struct|class)\s+(\w+(?:View|Controller|SplitView))\b/);
    if (!classMatch) return null;
    typeMatches.push(classMatch as unknown as RegExpExecArray);
  }

  const typeName = typeMatches[0][1];
  const name = toKebab(stripSwiftSuffix(typeName));
  if (!name) return null;

  // Find all references to other view types
  const refs = new Set<string>();
  for (const match of content.matchAll(SWIFT_REFERENCE_PATTERN)) {
    const ref = match[1];
    if (ref !== typeName) refs.add(ref); // don't self-reference
  }

  // Complexity analysis
  const lines = content.split("\n").length;
  const branches = countPatterns(content, [
    /\bif\b/g, /\bswitch\b/g, /\bguard\b/g, /\belse\b/g,
    /\bcase\b/g, /\?\s*[^?]/g, // ternary
  ]);
  const depth = maxNestingDepth(content);

  return {
    path,
    name,
    typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── React/TSX analyzer ───

const TSX_COMPONENT_PATTERN = /(?:export\s+(?:default\s+)?)?(?:function|const)\s+([A-Z][A-Za-z0-9]+)/g;
const TSX_JSX_PATTERN = /<([A-Z][A-Za-z0-9]+)/g;
const TSX_IMPORT_PATTERN = /import\s+(?:\{[^}]*\}|(\w+))\s+from\s+["']([^"']+)["']/g;

export async function analyzeReactFile(path: string): Promise<FileNode | null> {
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return null;
  }

  // Skip test files, stories, configs
  const base = basename(path);
  if (base.includes(".test.") || base.includes(".spec.") || base.includes(".stories.")) return null;
  if (base === "index.tsx" || base === "index.jsx") return null;

  // Find the component name
  const componentMatches = [...content.matchAll(TSX_COMPONENT_PATTERN)];
  if (componentMatches.length === 0) return null;

  const typeName = componentMatches[0][1];
  const name = toKebab(stripReactSuffix(typeName));
  if (!name) return null;

  // Find JSX references to other components
  const refs = new Set<string>();
  for (const match of content.matchAll(TSX_JSX_PATTERN)) {
    const ref = match[1];
    if (ref !== typeName) refs.add(ref);
  }

  // Complexity
  const lines = content.split("\n").length;
  const branches = countPatterns(content, [
    /\bif\s*\(/g, /\bswitch\s*\(/g, /\?\s*[^?:]/g,
    /&&\s*[(<]/g, // conditional rendering: {foo && <Bar/>}
    /\?\?\s/g, // nullish coalescing
  ]);
  const depth = maxNestingDepth(content);

  return {
    path,
    name,
    typeName,
    references: [...refs],
    complexity: { lines, branches, depth, references: refs.size },
  };
}

// ─── Graph builder ───

export function buildGraph(nodes: FileNode[]): {
  roots: GraphNode[];
  all: Map<string, GraphNode>;
} {
  // Index by typeName for reference resolution
  const byTypeName = new Map<string, FileNode>();
  for (const node of nodes) {
    byTypeName.set(node.typeName, node);
  }

  // Count in-degrees (how many files reference each type)
  const inDegrees = new Map<string, number>();
  for (const node of nodes) {
    if (!inDegrees.has(node.typeName)) inDegrees.set(node.typeName, 0);
    for (const ref of node.references) {
      if (byTypeName.has(ref)) {
        inDegrees.set(ref, (inDegrees.get(ref) ?? 0) + 1);
      }
    }
  }

  // Build graph nodes
  const graphNodes = new Map<string, GraphNode>();
  const visited = new Set<string>();

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

    // Resolve children (referenced types that exist in our file set)
    for (const ref of fileNode.references) {
      const child = toGraphNode(ref);
      if (child) gn.children.push(child);
    }

    // Sort children: most complex first (they're the important sub-areas)
    gn.children.sort(
      (a, b) =>
        b.complexity.references + b.complexity.branches -
        (a.complexity.references + a.complexity.branches),
    );

    return gn;
  }

  // Build all graph nodes
  for (const node of nodes) {
    toGraphNode(node.typeName);
  }

  // Roots = nodes with inDegree 0, or the top N most-referencing nodes
  let roots = [...graphNodes.values()].filter((n) => n.inDegree === 0);

  // If no clear roots, pick nodes with highest outgoing references
  if (roots.length === 0) {
    roots = [...graphNodes.values()]
      .sort((a, b) => b.complexity.references - a.complexity.references)
      .slice(0, 5);
  }

  // Sort roots by complexity (most complex = most important area)
  roots.sort(
    (a, b) =>
      b.complexity.references + b.complexity.branches -
      (a.complexity.references + a.complexity.branches),
  );

  return { roots, all: graphNodes };
}

// ─── Mermaid from graph ───

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

    // Show complexity as a visual indicator
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

export function graphToAreas(roots: GraphNode[]): {
  name: string;
  children: string[];
  complexity: number;
}[] {
  const areas: { name: string; children: string[]; complexity: number }[] = [];

  for (const root of roots) {
    // Only include nodes that are significant (have children or high complexity)
    if (root.children.length === 0 && root.complexity.branches < 3) continue;

    areas.push({
      name: root.name,
      children: root.children
        .filter((c) => c.complexity.branches > 1 || c.children.length > 0)
        .map((c) => c.name)
        .slice(0, 12),
      complexity:
        root.complexity.branches +
        root.complexity.references +
        root.children.reduce(
          (sum, c) => sum + c.complexity.branches + c.complexity.references,
          0,
        ),
    });
  }

  // Sort by complexity — most important areas first
  areas.sort((a, b) => b.complexity - a.complexity);

  return areas;
}

// ─── Helpers ───

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

function toKebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

function stripSwiftSuffix(name: string): string {
  const suffixes = [
    "ViewController", "OutlineView", "SplitView", "EditorView",
    "PanelView", "BrowserView", "ListView", "TreeView", "CardView",
    "DetailView", "PickerView", "BarView", "PopoverView", "SheetView",
    "OverlayView", "ToolbarView", "HeaderView", "FooterView",
    "View", "Controller",
  ];
  for (const s of suffixes) {
    if (name.length > s.length && name.endsWith(s)) return name.slice(0, -s.length);
  }
  return name;
}

function stripReactSuffix(name: string): string {
  const suffixes = [
    "Component", "Container", "Provider", "Layout", "Page", "Modal",
    "Dialog", "Drawer", "Panel", "Widget", "Card", "List", "Form",
    "Sidebar", "Header", "Footer", "Toolbar",
  ];
  for (const s of suffixes) {
    if (name.length > s.length && name.endsWith(s)) return name.slice(0, -s.length);
  }
  return name;
}

function countPatterns(content: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    const matches = content.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

function maxNestingDepth(content: string): number {
  let max = 0;
  let current = 0;
  for (const char of content) {
    if (char === "{") { current++; if (current > max) max = current; }
    if (char === "}") current--;
  }
  return max;
}

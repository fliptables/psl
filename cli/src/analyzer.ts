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

/** Names that are infrastructure/utility, not product areas */
const INFRASTRUCTURE_NAMES = new Set([
  "icon", "icon-view", "tag", "tag-view", "pulsing-dot",
  "base-tree-cell", "keyboard-navigable", "keyboard-navigable-outline",
  "fixed-bounds", "resize-cursor", "toast-overlay", "empty-state-text",
  "empty-state-content", "global-key-monitor", "filter-bar-key-monitor",
  "avatar-animation", "starfield", "pixel-avatar", "hover-brighten",
]);

/** Patterns that indicate a utility/leaf component, not a product area */
const LEAF_PATTERNS = [
  /button$/i,     // FeedbackButton, LockButton, DictationButton
  /^icon/i,       // IconView
  /^tag/i,        // TagView
  /dot$/i,        // PulsingDot
  /monitor$/i,    // GlobalKeyMonitor
  /handler$/i,    // ShiftEnterHandler
  /helper$/i,
  /util/i,
  /extension/i,
];

function isInfrastructure(name: string, typeName: string): boolean {
  if (INFRASTRUCTURE_NAMES.has(name)) return true;
  for (const p of LEAF_PATTERNS) {
    if (p.test(typeName) || p.test(name)) return true;
  }
  return false;
}

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

    // Resolve children — skip infrastructure/utility references
    for (const ref of fileNode.references) {
      const refNode = byTypeName.get(ref);
      if (!refNode) continue;
      if (isInfrastructure(toKebab(stripSwiftSuffix(ref)), ref)) continue;

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

  // Find the true entry point: look for App/Scene types first
  const appEntries = [...graphNodes.values()].filter(
    (n) =>
      n.typeName.endsWith("App") ||
      n.typeName.endsWith("Scene") ||
      n.typeName === "ContentView",
  );

  // Find layout containers: high out-degree, many children = layout roots
  const layoutRoots = [...graphNodes.values()]
    .filter(
      (n) =>
        n.children.length >= 3 &&
        !isInfrastructure(n.name, n.typeName),
    )
    .sort((a, b) => b.children.length - a.children.length);

  // Roots strategy:
  // 1. App entry points (ScapeApp, ContentView, etc.)
  // 2. Layout containers with many children (EmbeddedLayoutView, etc.)
  // 3. Nodes with inDegree 0 that are NOT infrastructure
  const rootSet = new Set<string>();
  const roots: GraphNode[] = [];

  // Add app entries
  for (const entry of appEntries) {
    if (!rootSet.has(entry.typeName)) {
      rootSet.add(entry.typeName);
      roots.push(entry);
    }
  }

  // Add top layout containers (if not already children of app entries)
  for (const layout of layoutRoots.slice(0, 5)) {
    if (!rootSet.has(layout.typeName)) {
      // Check if this is already a child of an existing root
      const isChild = roots.some((r) =>
        r.children.some((c) => c.typeName === layout.typeName),
      );
      if (!isChild) {
        rootSet.add(layout.typeName);
        roots.push(layout);
      }
    }
  }

  // Add remaining inDegree-0 nodes that are significant (not infrastructure)
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

  // Sort: app entries first, then by total subtree complexity
  roots.sort((a, b) => {
    const aIsApp = a.typeName.endsWith("App") ? 1 : 0;
    const bIsApp = b.typeName.endsWith("App") ? 1 : 0;
    if (aIsApp !== bIsApp) return bIsApp - aIsApp;
    return (
      b.complexity.references + b.complexity.branches + b.children.length * 5 -
      (a.complexity.references + a.complexity.branches + a.children.length * 5)
    );
  });

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

/** Recursively collect all descendant names from a node */
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

export function graphToAreas(roots: GraphNode[]): {
  name: string;
  children: string[];
  complexity: number;
}[] {
  const areas: { name: string; children: string[]; complexity: number }[] = [];
  const seen = new Set<string>();

  // Strategy: app entries and layout containers are structural — they don't
  // appear as areas. Instead, their significant children become top-level areas.
  // Everything else (orphan roots) gets listed if significant enough.

  const isAppEntry = (n: GraphNode) =>
    n.typeName.endsWith("App") || n.typeName === "ContentView";

  // Sort roots: layout containers first (most children), then app entries
  const sorted = [...roots].sort((a, b) => b.children.length - a.children.length);

  for (const root of sorted) {
    if (seen.has(root.name)) continue;

    // App entries and layout containers: promote their children, skip the container
    // App entries always promote; layout containers only if we haven't promoted too many
    if (isAppEntry(root) || (root.children.length >= 4 && areas.length < 3)) {
      seen.add(root.name);

      for (const child of root.children) {
        if (seen.has(child.name)) continue;
        if (isInfrastructure(child.name, child.typeName)) continue;

        // Must be substantial to be a top-level area
        const totalComplexity = child.complexity.branches + child.complexity.references;
        if (totalComplexity < 15 && child.children.length < 2) continue;

        seen.add(child.name);

        // Collect children 2 levels deep, deduplicated
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
      // Smaller root — list as a single area with its children
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

  // Sort by complexity
  areas.sort((a, b) => b.complexity - a.complexity);

  // Remove areas with no children and low complexity — they're leaf nodes, not areas
  const filtered = areas.filter(
    (a) => a.children.length > 0 || a.complexity >= 30,
  );

  // Deduplicate children across areas (same child shouldn't appear in multiple)
  const areaNames = new Set(filtered.map((a) => a.name));
  const globalSeen = new Set<string>();
  for (const area of filtered) {
    area.children = area.children
      .filter((c) => !areaNames.has(c)) // don't list other areas as children
      .filter((c) => {
        if (globalSeen.has(c)) return false;
        globalSeen.add(c);
        return true;
      });
  }

  // Cap at ~15 areas max — more than that isn't useful as a starting point
  return filtered.slice(0, 15);
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

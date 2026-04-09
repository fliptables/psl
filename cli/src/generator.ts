import type { ScanResult } from "./scanner.js";

export function generate(scan: ScanResult): string {
  const productName = scan.productName ?? "myapp";
  const lines: string[] = [];

  lines.push(`# PSL: ${productName}`);
  lines.push(`<!-- psl: v1.0.0 -->`);
  lines.push("");
  lines.push(`> Detected project type: **${scan.projectType}**`);
  lines.push(`> This is a generated draft — edit to canonicalize your vocabulary.`);
  lines.push("");

  // Mermaid diagram
  lines.push("## Map");
  lines.push("");
  lines.push("```mermaid");
  lines.push(scan.mermaid);
  lines.push("```");
  lines.push("");

  // Areas
  if (scan.areas.length > 0) {
    lines.push("## Areas");
    lines.push("");
    for (const area of scan.areas) {
      const sourceTag = area.source !== "directory" ? ` _(from ${area.source})_` : "";
      lines.push(`- **${area.name}**${sourceTag}`);
      if (area.children.length > 0) {
        lines.push(`  - ${area.children.join(", ")}`);
      }
    }
    lines.push("");
  }

  // Concerns
  lines.push("## Concerns");
  lines.push("");

  const concernAliases: Record<string, string[]> = {
    performance: ["perf", "speed"],
    visual: ["ui", "appearance"],
    crash: ["exc", "fatal"],
    ux: ["usability", "flow"],
    data: ["persistence", "sync"],
    lifecycle: ["init", "teardown"],
  };

  for (const concern of scan.concerns) {
    const aliases = concernAliases[concern];
    if (aliases) {
      lines.push(`- **${concern}** (aka: ${aliases.join(", ")})`);
    } else {
      lines.push(`- **${concern}**`);
    }
  }
  lines.push("");

  // Qualities
  lines.push("## Qualities");
  lines.push("");
  lines.push("- **responsive** — interactions feel instant");
  lines.push("- **accessible** — usable by everyone");
  lines.push("");

  // Aliases YAML block
  lines.push("## Aliases");
  lines.push("");
  lines.push("```yaml");
  for (const concern of scan.concerns) {
    const aliases = concernAliases[concern];
    if (aliases) {
      lines.push(`${concern}: [${aliases.join(", ")}]`);
    }
  }
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

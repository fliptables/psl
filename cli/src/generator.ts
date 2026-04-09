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
      lines.push(`- **${area.name}**`);
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
  const aliasEntries: string[] = [];
  for (const concern of scan.concerns) {
    const aliases = concernAliases[concern];
    if (aliases) {
      aliasEntries.push(`${concern}: [${aliases.join(", ")}]`);
    }
  }
  // Add area aliases if any areas have aka annotations (from docs scanning)
  for (const [canonical, aliases] of scan.vocabulary) {
    if (aliases.length > 0) {
      aliasEntries.push(`${canonical}: [${aliases.join(", ")}]`);
    }
  }

  if (aliasEntries.length > 0) {
    lines.push("## Aliases");
    lines.push("");
    lines.push("```yaml");
    for (const entry of aliasEntries) {
      lines.push(entry);
    }
    lines.push("```");
    lines.push("");
  }

  // Usage examples
  lines.push("## Usage Examples");
  lines.push("");
  lines.push("<!-- PSL tokens can be used anywhere — tickets, PRs, commits, Slack, agent prompts. -->");
  lines.push("<!-- Edit these examples to match your team's actual workflow. -->");
  lines.push("");

  // Pick real area names for examples
  const areaNames = scan.areas.map((a) => a.name);
  const firstArea = areaNames[0] ?? "dashboard";
  const secondArea = areaNames[1] ?? "editor";
  const firstChild = scan.areas[0]?.children[0];
  const secondChild = scan.areas[1]?.children[0];
  const concernNames = scan.concerns;

  lines.push("**In tickets and issues:**");
  lines.push("```");
  lines.push(`[${productName}.${firstArea}.${concernNames[0]}] ${firstArea} feels sluggish when loading large datasets`);
  if (firstChild) {
    lines.push(`[${productName}.${firstArea}.${concernNames[1]}.${firstChild}] ${firstChild} needs visual refresh`);
  }
  lines.push(`[${productName}.${secondArea}.${concernNames[2]}] app crashes on launch when ${secondArea} state is corrupted`);
  lines.push("```");
  lines.push("");

  lines.push("**In commit messages:**");
  lines.push("```");
  lines.push(`fix(${firstArea}): resolve ${concernNames[0]} regression in ${firstChild ?? firstArea}`);
  lines.push(`feat(${secondArea}): add keyboard navigation support`);
  lines.push("```");
  lines.push("");

  lines.push("**In PR descriptions:**");
  lines.push("```");
  lines.push(`Addresses {${productName}.${firstArea}.${concernNames[0]}} — reduces render time by 40%.`);
  lines.push(`Also fixes {${productName}.${secondArea}.${concernNames[3]}} edge case with empty state.`);
  lines.push("```");
  lines.push("");

  lines.push("**In agent prompts:**");
  lines.push("```");
  lines.push(`Fix the {${productName}.${firstArea}.${concernNames[0]}} issue — the ${firstChild ?? firstArea} takes 3s to render.`);
  lines.push(`Review {${productName}.${secondArea}} for ${concernNames[1]} inconsistencies.`);
  lines.push("```");
  lines.push("");

  lines.push("**In Slack / chat:**");
  lines.push("```");
  lines.push(`Heads up — {${productName}.${firstArea}} has a ${concernNames[0]} regression after the last deploy.`);
  lines.push(`Can someone look at {${productName}.${secondArea}.${concernNames[2]}}? Users are reporting crashes.`);
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

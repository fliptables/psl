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

  // Usage examples — pick areas that aren't the app entry point
  const realAreas = scan.areas.filter(
    (a) => !a.name.endsWith("-app") && a.name !== productName,
  );
  const firstArea = realAreas[0]?.name ?? "dashboard";
  const secondArea = realAreas[1]?.name ?? "editor";
  const firstChild = realAreas[0]?.children[0];
  const concerns = scan.concerns;

  lines.push("## How to Use");
  lines.push("");
  lines.push("<!-- Use PSL tokens in braces anywhere — tickets, PRs, commits, Slack, agent prompts. -->");
  lines.push("<!-- Edit these examples to match your team's workflow. -->");
  lines.push("");

  lines.push("**Tickets & issues:**");
  lines.push("```");
  lines.push(`{${productName}.${firstArea}.${concerns[0]}} — ${firstArea} feels sluggish when loading large datasets`);
  if (firstChild) {
    lines.push(`{${productName}.${firstArea}.${concerns[1]}.${firstChild}} — ${firstChild} needs visual refresh`);
  }
  lines.push(`{${productName}.${secondArea}.${concerns[2]}} — crashes on launch when ${secondArea} state is corrupted`);
  lines.push("```");
  lines.push("");

  lines.push("**Commits:**");
  lines.push("```");
  lines.push(`fix{${productName}.${firstArea}.${concerns[0]}}: resolve render regression in ${firstChild ?? firstArea}`);
  lines.push(`feat{${productName}.${secondArea}}: add keyboard navigation`);
  lines.push("```");
  lines.push("");

  lines.push("**PRs:**");
  lines.push("```");
  lines.push(`Addresses {${productName}.${firstArea}.${concerns[0]}} — reduces render time by 40%.`);
  lines.push(`Also fixes {${productName}.${secondArea}.${concerns[3]}} edge case with empty state.`);
  lines.push("```");
  lines.push("");

  lines.push("**Agent prompts:**");
  lines.push("```");
  lines.push(`Fix {${productName}.${firstArea}.${concerns[0]}} — the ${firstChild ?? firstArea} takes 3s to render.`);
  lines.push(`Review {${productName}.${secondArea}} for ${concerns[1]} inconsistencies.`);
  lines.push("```");
  lines.push("");

  lines.push("**Slack:**");
  lines.push("```");
  lines.push(`Heads up — {${productName}.${firstArea}} has a ${concerns[0]} regression after the last deploy.`);
  lines.push(`Anyone looked at {${productName}.${secondArea}.${concerns[2]}}? Users reporting crashes.`);
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

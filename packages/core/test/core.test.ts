import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  parse,
  resolve,
  resolveDetailed,
  validate,
  search,
  canonicalize,
  merge,
  toKebab,
} from "../src/index.js";

// ─── Example PSL.md from SPEC.md ───

const EXAMPLE_PSL = `# PSL: scape
<!-- psl: v1.0.0 -->

## Areas
- **inspector** (aka: right-sidebar, trailing-sidebar)
  - drag-handle, content, header
- **editor** (aka: code-editor, monaco)
  - tabs, gutter, minimap
- **terminal**
  - split, prompt, output

## Concerns
- **performance** (aka: perf, speed)
- **visual** (aka: ui, appearance)
- **crash** (aka: exc, fatal)

## Qualities
- **responsive** — interactions complete within one frame
- **non-blocking** — UI never freezes during async work

## Aliases

\`\`\`yaml
inspector: [right-sidebar, trailing-sidebar]
editor: [code-editor, monaco]
performance: [perf, speed]
visual: [ui, appearance]
crash: [exc, fatal]
\`\`\`
`;

// ─── Parser tests ───

describe("parse", () => {
  it("parses the example PSL.md", () => {
    const vocab = parse(EXAMPLE_PSL);
    assert.equal(vocab.productName, "scape");
    assert.equal(vocab.specVersion, "1.0.0");
    assert.equal(vocab.warnings.length, 0);
  });

  it("extracts areas, concerns, and qualities", () => {
    const vocab = parse(EXAMPLE_PSL);
    const areas = vocab.sections.find((s) => s.type === "areas");
    const concerns = vocab.sections.find((s) => s.type === "concerns");
    const qualities = vocab.sections.find((s) => s.type === "qualities");

    assert.ok(areas);
    assert.equal(areas.tokens.length, 3); // inspector, editor, terminal
    assert.ok(concerns);
    assert.equal(concerns.tokens.length, 3); // performance, visual, crash
    assert.ok(qualities);
    assert.equal(qualities.tokens.length, 2); // responsive, non-blocking
  });

  it("parses inline aliases from (aka: ...)", () => {
    const vocab = parse(EXAMPLE_PSL);
    const inspector = vocab.tokens.get("inspector");
    assert.ok(inspector);
    assert.deepEqual(inspector.aliases, ["right-sidebar", "trailing-sidebar"]);
  });

  it("parses YAML alias block", () => {
    const vocab = parse(EXAMPLE_PSL);
    assert.equal(vocab.aliases.get("right-sidebar"), "inspector");
    assert.equal(vocab.aliases.get("perf"), "performance");
    assert.equal(vocab.aliases.get("monaco"), "editor");
  });

  it("parses descriptions after em-dash", () => {
    const vocab = parse(EXAMPLE_PSL);
    const responsive = vocab.tokens.get("responsive");
    assert.ok(responsive);
    assert.equal(responsive.description, "interactions complete within one frame");
  });

  it("warns on missing header", () => {
    const vocab = parse("## Areas\n- **dashboard**\n");
    assert.ok(vocab.warnings.some((w) => w.code === "missing_header"));
    assert.ok(vocab.warnings.some((w) => w.code === "missing_version"));
  });

  it("warns on unknown version", () => {
    const vocab = parse("# PSL: test\n<!-- psl: v99.0.0 -->\n");
    assert.ok(vocab.warnings.some((w) => w.code === "unknown_version"));
  });

  it("silently ignores unknown sections", () => {
    const psl = `# PSL: test\n<!-- psl: v1.0.0 -->\n\n## Map\n\nsome content\n\n## Areas\n- **dashboard**\n`;
    const vocab = parse(psl);
    // Should have "Map" as a custom section and "Areas" as areas
    const custom = vocab.sections.filter((s) => s.type === "custom");
    const areas = vocab.sections.filter((s) => s.type === "areas");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].heading, "Map");
    assert.equal(areas.length, 1);
    // No warnings for the custom section
    assert.equal(vocab.warnings.length, 0);
  });

  it("handles empty input", () => {
    const vocab = parse("");
    assert.equal(vocab.productName, "unknown");
    assert.ok(vocab.warnings.length >= 1); // missing header at minimum
  });
});

// ─── Resolver tests ───

describe("resolve", () => {
  const vocab = parse(EXAMPLE_PSL);

  it("resolves canonical names", () => {
    const result = resolve("inspector", vocab);
    assert.equal(result.found, true);
    if (result.found) assert.equal(result.canonical, "inspector");
  });

  it("resolves aliases", () => {
    const result = resolve("right-sidebar", vocab);
    assert.equal(result.found, true);
    if (result.found) assert.equal(result.canonical, "inspector");
  });

  it("strips braces", () => {
    const result = resolve("{performance}", vocab);
    assert.equal(result.found, true);
    if (result.found) assert.equal(result.canonical, "performance");
  });

  it("returns suggestions for unknown terms", () => {
    const result = resolve("inspctr", vocab);
    assert.equal(result.found, false);
    if (!result.found) assert.ok(result.suggestions.length > 0);
  });
});

describe("resolveDetailed", () => {
  const vocab = parse(EXAMPLE_PSL);

  it("returns full metadata for canonical match", () => {
    const result = resolveDetailed("inspector", vocab);
    assert.equal(result.found, true);
    assert.equal(result.canonical, "inspector");
    assert.equal(result.matchedVia, "canonical");
    assert.deepEqual(result.aliases, ["right-sidebar", "trailing-sidebar"]);
    assert.ok(result.path.includes("scape"));
  });

  it("returns matchedVia alias for alias lookups", () => {
    const result = resolveDetailed("perf", vocab);
    assert.equal(result.found, true);
    assert.equal(result.canonical, "performance");
    assert.equal(result.matchedVia, "alias");
  });

  it("returns not_found for unknown terms", () => {
    const result = resolveDetailed("nonexistent", vocab);
    assert.equal(result.found, false);
    assert.equal(result.matchedVia, "not_found");
  });
});

// ─── Validator tests ───

describe("validate", () => {
  const vocab = parse(EXAMPLE_PSL);

  it("validates correct tokens (syntax only)", () => {
    assert.ok(validate("{scape.inspector.performance}").valid);
    assert.ok(validate("{myapp.dashboard}").valid);
    assert.ok(validate("{a}").valid);
  });

  it("rejects invalid syntax", () => {
    assert.ok(!validate("scape.inspector").valid); // no braces
    assert.ok(!validate("{Scape.Inspector}").valid); // uppercase
    assert.ok(!validate("{scape.2}").valid); // standalone number
    assert.ok(!validate("{}").valid); // empty
    assert.ok(!validate("{.scape}").valid); // leading dot
  });

  it("validates against vocabulary", () => {
    const result = validate("{scape.inspector}", vocab);
    assert.ok(result.valid);
  });

  it("detects unknown product", () => {
    const result = validate("{other.inspector}", vocab);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.code === "unknown_product"));
  });

  it("detects unknown segments", () => {
    const result = validate("{scape.nonexistent}", vocab);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.code === "unknown_segment"));
  });

  it("resolves aliases in validation", () => {
    const result = validate("{scape.perf}", vocab);
    assert.ok(result.valid); // "perf" is an alias for "performance"
  });
});

// ─── Searcher tests ───

describe("search", () => {
  const vocab = parse(EXAMPLE_PSL);

  it("finds exact matches", () => {
    const results = search("inspector", vocab);
    assert.ok(results.length > 0);
    assert.equal(results[0].canonical, "inspector");
    assert.equal(results[0].matchedVia, "canonical");
  });

  it("finds prefix matches", () => {
    const results = search("insp", vocab);
    assert.ok(results.length > 0);
    assert.equal(results[0].canonical, "inspector");
  });

  it("finds alias matches", () => {
    // "right-sidebar" is an alias for "inspector" and not a prefix of any canonical name
    const results = search("right-sidebar", vocab);
    assert.ok(results.length > 0);
    assert.equal(results[0].canonical, "inspector");
    assert.equal(results[0].matchedVia, "alias");
  });

  it("respects limit", () => {
    const results = search("e", vocab, 2);
    assert.ok(results.length <= 2);
  });

  it("returns empty for empty query", () => {
    assert.deepEqual(search("", vocab), []);
  });

  it("includes fullToken with product prefix", () => {
    const results = search("terminal", vocab);
    assert.ok(results.length > 0);
    assert.equal(results[0].fullToken, "{scape.terminal}");
  });
});

// ─── Canonicalizer tests ───

describe("canonicalize", () => {
  const vocab = parse(EXAMPLE_PSL);

  it("replaces aliases with canonical names", () => {
    const result = canonicalize("Fix {scape.right-sidebar.perf}", vocab);
    assert.equal(result.text, "Fix {scape.inspector.performance}");
    assert.equal(result.replacements.length, 1);
  });

  it("leaves canonical tokens unchanged", () => {
    const result = canonicalize("Fix {scape.inspector}", vocab);
    assert.equal(result.text, "Fix {scape.inspector}");
    assert.equal(result.replacements.length, 0);
  });

  it("handles multiple tokens", () => {
    const result = canonicalize("{scape.perf} and {scape.ui}", vocab);
    assert.equal(result.text, "{scape.performance} and {scape.visual}");
    assert.equal(result.replacements.length, 2);
  });

  it("leaves text without tokens unchanged", () => {
    const result = canonicalize("just some text", vocab);
    assert.equal(result.text, "just some text");
    assert.equal(result.replacements.length, 0);
  });

  it("does not touch the product name segment", () => {
    const result = canonicalize("{scape.inspector}", vocab);
    assert.equal(result.text, "{scape.inspector}");
  });
});

// ─── Merge tests ───

describe("merge", () => {
  it("merges two vocabularies", () => {
    const psl1 = parse("# PSL: app1\n<!-- psl: v1.0.0 -->\n## Areas\n- **dashboard**\n");
    const psl2 = parse("# PSL: app2\n<!-- psl: v1.0.0 -->\n## Areas\n- **settings**\n");
    const merged = merge([psl1, psl2]);
    assert.ok(merged.tokens.has("app1.dashboard"));
    assert.ok(merged.tokens.has("app2.settings"));
  });

  it("handles empty input", () => {
    const merged = merge([]);
    assert.equal(merged.productName, "merged");
    assert.equal(merged.tokens.size, 0);
  });

  it("returns single vocab unchanged", () => {
    const psl = parse(EXAMPLE_PSL);
    const merged = merge([psl]);
    assert.equal(merged, psl);
  });
});

// ─── toKebab tests ───

describe("toKebab", () => {
  it("converts camelCase", () => {
    assert.equal(toKebab("myComponent"), "my-component");
  });

  it("converts PascalCase", () => {
    assert.equal(toKebab("MyComponent"), "my-component");
  });

  it("handles underscores", () => {
    assert.equal(toKebab("my_component"), "my-component");
  });

  it("strips invalid characters", () => {
    assert.equal(toKebab("my.component!"), "mycomponent");
  });

  it("lowercases", () => {
    assert.equal(toKebab("UPPER"), "upper");
  });
});

// ─── Round-trip test: generator output → parser ───

describe("round-trip", () => {
  it("parser handles a generated PSL.md with custom sections", () => {
    // Simulates what psl-init generates — includes ## Map and ## How to Use
    const generated = `# PSL: myapp
<!-- psl: v1.0.0 -->

> Detected project type: **react**
> This is a generated draft — edit to canonicalize your vocabulary.

## Map

\`\`\`mermaid
graph TD
  myapp["myapp"]
  myapp --> dashboard["dashboard"]
\`\`\`

## Areas

- **dashboard**
  - stats, activity-feed, header
- **settings**
  - profile, billing, notifications

## Concerns

- **performance** (aka: perf, speed)
- **visual** (aka: ui, appearance)
- **crash** (aka: exc, fatal)
- **ux** (aka: usability, flow)
- **data** (aka: persistence, sync)
- **lifecycle** (aka: init, teardown)

## Qualities

- **responsive** — interactions feel instant
- **accessible** — usable by everyone

## Aliases

\`\`\`yaml
performance: [perf, speed]
visual: [ui, appearance]
crash: [exc, fatal]
ux: [usability, flow]
data: [persistence, sync]
lifecycle: [init, teardown]
\`\`\`

## How to Use

<!-- Usage examples -->
`;

    const vocab = parse(generated);

    // No warnings — custom sections (Map, How to Use) should be silently ignored
    assert.equal(vocab.warnings.length, 0, `Unexpected warnings: ${JSON.stringify(vocab.warnings)}`);

    // Product name parsed correctly
    assert.equal(vocab.productName, "myapp");

    // Areas parsed
    assert.ok(vocab.tokens.has("dashboard"));
    assert.ok(vocab.tokens.has("settings"));

    // Concerns parsed with aliases
    assert.ok(vocab.tokens.has("performance"));
    assert.equal(vocab.aliases.get("perf"), "performance");
    assert.equal(vocab.aliases.get("ui"), "visual");

    // Qualities parsed
    assert.ok(vocab.tokens.has("responsive"));
    assert.ok(vocab.tokens.has("accessible"));

    // Resolution works
    const result = resolve("perf", vocab);
    assert.equal(result.found, true);
    if (result.found) assert.equal(result.canonical, "performance");

    // Validation works
    assert.ok(validate("{myapp.dashboard.performance}", vocab).valid);
    assert.ok(!validate("{myapp.nonexistent}", vocab).valid);

    // Search works
    const searchResults = search("dash", vocab);
    assert.ok(searchResults.length > 0);
    assert.equal(searchResults[0].canonical, "dashboard");

    // Canonicalize works
    const canonical = canonicalize("{myapp.perf}", vocab);
    assert.equal(canonical.text, "{myapp.performance}");
  });
});

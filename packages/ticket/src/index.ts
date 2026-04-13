#!/usr/bin/env node

import { program } from "commander";
import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildPrompt } from "./prompt.js";
import { readConfig, setupInteractive } from "./config.js";
import * as claudeCode from "./backends/claude-code.js";
import * as anthropicApi from "./backends/anthropic-api.js";

async function findPslMd(startDir: string): Promise<string | null> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "PSL.md");
    try {
      await stat(candidate);
      return candidate;
    } catch {
      const parent = resolve(dir, "..");
      if (parent === dir) return null;
      dir = parent;
    }
  }
  return null;
}

program
  .name("psl-ticket")
  .description("Generate a PSL-tagged ticket from natural language")
  .version("1.0.0")
  .argument("<description>", "Description of what to build or fix")
  .option("--backend <type>", "Backend: claude-code or api", "")
  .option("--model <model>", "Model ID override")
  .option("--psl <path>", "Explicit path to PSL.md")
  .action(async (description: string, options: { backend: string; model: string; psl: string }) => {
    // Find PSL.md
    let pslContent: string | null = null;
    const pslPath = options.psl
      ? resolve(options.psl)
      : await findPslMd(process.cwd());

    if (pslPath) {
      try {
        pslContent = await readFile(pslPath, "utf-8");
      } catch {
        console.error(`Warning: could not read ${pslPath}`);
      }
    } else {
      console.error(
        "Warning: No PSL.md found. Tokens in output will be unvalidated.",
      );
      console.error("Run `npx psl-init` to create one.\n");
    }

    const prompt = buildPrompt(pslContent, description);

    // Determine backend
    let backend = options.backend;
    if (!backend) {
      // Auto-detect
      if (await claudeCode.isAvailable()) {
        backend = "claude-code";
      } else {
        backend = "api";
      }
    }

    try {
      let output: string;

      if (backend === "claude-code") {
        console.error("Using Claude Code backend...\n");
        output = await claudeCode.generate(prompt);
      } else if (backend === "api") {
        const config = await readConfig();
        if (!config.anthropicApiKey) {
          console.error("No LLM backend available.\n");
          console.error("Option 1: Install Claude Code (claude.ai/code)");
          console.error(
            "Option 2: Run `npx psl-ticket --setup` to configure an Anthropic API key\n",
          );
          process.exit(1);
        }
        console.error("Using Anthropic API backend...\n");
        output = await anthropicApi.generate(
          prompt,
          config.anthropicApiKey,
          options.model ?? config.defaultModel,
        );
      } else {
        console.error(`Unknown backend: ${backend}`);
        process.exit(1);
        return;
      }

      console.log(output);
    } catch (err) {
      console.error(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

// Setup subcommand
program
  .command("setup")
  .description("Configure Anthropic API key for the ticket generator")
  .action(async () => {
    await setupInteractive();
  });

program.parse();

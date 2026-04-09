#!/usr/bin/env node

import { program } from "commander";
import { resolve } from "node:path";
import { access, writeFile } from "node:fs/promises";
import { scan } from "./scanner.js";
import { generate } from "./generator.js";

interface CliOptions {
  path: string;
  output: string;
  force?: boolean;
  verbose?: boolean;
}

program
  .name("psl-init")
  .description("Generate PSL.md for your project")
  .version("1.0.0")
  .option("--path <dir>", "project root directory", ".")
  .option("--output <file>", "output filename", "PSL.md")
  .option("--force", "overwrite existing PSL.md without prompting")
  .option("--verbose", "show scanning details")
  .action(async (options: CliOptions) => {
    const root = resolve(options.path);
    const outputPath = resolve(root, options.output);

    // Check if output file already exists
    if (!options.force) {
      try {
        await access(outputPath);
        console.error(
          `${options.output} already exists. Use --force to overwrite.`,
        );
        process.exit(1);
      } catch {
        // file doesn't exist, proceed
      }
    }

    try {
      console.log(`Scanning ${root}...`);

      const result = await scan(root, {
        verbose: options.verbose,
      });

      const content = generate(result);

      await writeFile(outputPath, content, "utf-8");

      console.log(`\nCreated ${options.output}`);
      console.log(
        `\nProduct: ${result.productName ?? "(edit the product name)"}`,
      );
      console.log(`Areas found: ${result.areas.length}`);
      console.log(`\nEdit ${options.output} to canonicalize your vocabulary.`);
    } catch (err) {
      console.error(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program.parse();

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline/promises";

const CONFIG_PATH = join(homedir(), ".config", "psl", "config.json");

interface PslConfig {
  anthropicApiKey?: string;
  defaultModel?: string;
}

export async function readConfig(): Promise<PslConfig> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function writeConfig(config: PslConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function setupInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\nPSL Ticket Generator Setup\n");
  console.log("This will configure your Anthropic API key for the ticket generator.");
  console.log(`Config file: ${CONFIG_PATH}\n`);

  const key = await rl.question("Anthropic API key: ");
  rl.close();

  if (!key.trim()) {
    console.log("No key provided. Setup cancelled.");
    return;
  }

  const config = await readConfig();
  config.anthropicApiKey = key.trim();
  await writeConfig(config);

  console.log(`\nAPI key saved to ${CONFIG_PATH} (permissions: 0600)`);
  console.log("You can now run: npx psl-ticket \"your description\"");
}

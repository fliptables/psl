import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Check if `claude` is available on $PATH */
export async function isAvailable(): Promise<boolean> {
  try {
    await execFileAsync("claude", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Run the ticket generation via headless Claude Code */
export async function generate(systemPrompt: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "claude",
    ["-p", systemPrompt, "--output-format", "text"],
    { timeout: 120_000, maxBuffer: 1024 * 1024 },
  );
  return stdout;
}

import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import stringArgv from "string-argv";
import { HISTORY_FILE } from "./constants.js";
import { runCommand } from "./runner.js";

export async function startRepl(): Promise<void> {
  await ensureHistoryFile();
  const history = loadHistory();
  const historyBuffer = [...history];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: [...history],
    prompt: "agent> "
  });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    if (trimmed === ":quit" || trimmed === ":exit") {
      rl.close();
      return;
    }
    try {
      const argv = stringArgv(trimmed);
      const output = await runCommand(argv);
      if (output) {
        process.stdout.write(`${output}\n`);
      }
      if (!historyBuffer.length || historyBuffer[historyBuffer.length - 1] !== trimmed) {
        historyBuffer.push(trimmed);
      }
    } catch (error) {
      process.stderr.write(`✗ ${(error as Error).message}\n`);
    } finally {
      rl.prompt();
    }
  });

  rl.on("close", () => {
    process.stdout.write("bye.\n");
    saveHistory(historyBuffer);
  });

  rl.prompt();
}

async function ensureHistoryFile(): Promise<void> {
  const dir = path.dirname(HISTORY_FILE);
  await fsPromises.mkdir(dir, { recursive: true }).catch(() => {});
  if (!fs.existsSync(HISTORY_FILE)) {
    await fsPromises.writeFile(HISTORY_FILE, "", "utf-8");
  }
}

function loadHistory(): string[] {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    return raw.split("\n").filter(Boolean).slice(-100);
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  const trimmed = history.filter((line) => line.trim().length > 0).slice(-200);
  fs.writeFileSync(HISTORY_FILE, `${trimmed.join("\n")}\n`, "utf-8");
}

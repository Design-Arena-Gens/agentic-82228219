#!/usr/bin/env node
import process from "node:process";
import { runCommand, setRuntimeTheme } from "./runner.js";
import { startRepl } from "./repl.js";
import { logAudit } from "./logger.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "--theme") {
    const theme = args[1];
    setRuntimeTheme(theme);
    args.splice(0, 2);
  }

  if (args.length === 0) {
    await logAudit({ command: "repl" });
    await startRepl();
    return;
  }

  if (args[0] === "--first-run") {
    const output = await runCommand(["--first-run"]);
    process.stdout.write(`${output}\n`);
    return;
  }

  try {
    const output = await runCommand(args);
    if (output) {
      process.stdout.write(`${output}\n`);
    }
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`✗ ${(error as Error).message}\n`);
    process.exitCode = error instanceof Error && error.message.includes("Unknown command") ? 2 : 1;
  }
}

void main();

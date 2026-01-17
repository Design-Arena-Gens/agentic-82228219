import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main(): Promise<void> {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-test-"));
  process.env.HOME = tempHome;

  const [{ runCommand }, { readState }] = await Promise.all([
    import("../runner.js"),
    import("../storage.js")
  ]);

  let output = await runCommand(["add", "Test task", "--due", "2035-01-01", "--tags", "work,focus"]);
  assert.match(output, /Task added/);

  const state = await readState();
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0]!.title, "Test task");

  output = await runCommand(["list", "--format", "json"]);
  const tasks = JSON.parse(output) as unknown[];
  assert.equal(tasks.length, 1);

  output = await runCommand(["done", "1"]);
  assert.match(output, /Task completed/);

  output = await runCommand(["list", "--status", "done", "--format", "json"]);
  const doneTasks = JSON.parse(output) as Array<{ status: string }>;
  assert.equal(doneTasks[0]!.status, "done");

  console.log("All tests passed");
}

await main();

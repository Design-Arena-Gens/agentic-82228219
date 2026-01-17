import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIRECTORY, DATA_FILE, CONFIG_FILE } from "./constants.js";
import type { AgentConfig, AgentState } from "./types.js";

const defaultState: AgentState = {
  nextId: 1,
  tasks: []
};

const defaultConfig: AgentConfig = {
  role: "tasks",
  theme: "minimal",
  defaultPriority: "medium",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  integrations: {}
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIRECTORY, { recursive: true });
}

export async function readState(): Promise<AgentState> {
  await ensureDataDir();
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AgentState;
    if (!parsed.nextId || !Array.isArray(parsed.tasks)) {
      throw new Error("Invalid state file");
    }
    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      await writeState(defaultState);
      return structuredClone(defaultState);
    }
    throw error;
  }
}

export async function writeState(state: AgentState): Promise<void> {
  await ensureDataDir();
  const serialized = JSON.stringify(state, null, 2);
  await writeFile(DATA_FILE, `${serialized}\n`, "utf-8");
}

export async function readConfig(): Promise<AgentConfig> {
  await ensureDataDir();
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AgentConfig;
    return { ...defaultConfig, ...parsed, integrations: parsed.integrations ?? {} };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      await writeConfig(defaultConfig);
      return structuredClone(defaultConfig);
    }
    throw error;
  }
}

export async function writeConfig(config: AgentConfig): Promise<void> {
  await ensureDataDir();
  const serialized = JSON.stringify(config, null, 2);
  await writeFile(CONFIG_FILE, `${serialized}\n`, "utf-8");
}

export function stateExists(): boolean {
  return fs.existsSync(DATA_FILE);
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

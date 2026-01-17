import { appendFile } from "node:fs/promises";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import { AUDIT_LOG_FILE, DATA_DIRECTORY } from "./constants.js";

export async function logAudit(entry: { command: string; details?: string }): Promise<void> {
  const timestamp = new Date().toISOString();
  const payload = {
    timestamp,
    command: entry.command,
    details: entry.details ?? null
  };
  await fsPromises.mkdir(DATA_DIRECTORY, { recursive: true }).catch(() => {});
  await fsPromises.mkdir(path.dirname(AUDIT_LOG_FILE), { recursive: true }).catch(() => {});
  await appendFile(AUDIT_LOG_FILE, `${JSON.stringify(payload)}\n`, "utf-8").catch(() => {
    // Intentionally ignore audit failures to avoid blocking the CLI.
  });
}

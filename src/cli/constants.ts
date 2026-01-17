import os from "node:os";
import path from "node:path";

export const AGENT_NAME = "agentic";
export const DATA_DIRECTORY = path.join(os.homedir(), `.${AGENT_NAME}`);
export const DATA_FILE = path.join(DATA_DIRECTORY, "data.json");
export const CONFIG_FILE = path.join(DATA_DIRECTORY, "config.json");
export const AUDIT_LOG_FILE = path.join(DATA_DIRECTORY, "audit.log");
export const HISTORY_FILE = path.join(DATA_DIRECTORY, "repl-history");

export const MAX_DEFAULT_LINES = 40;
export const DEFAULT_LIST_LIMIT = 20;

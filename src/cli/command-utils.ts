import { parseISO } from "date-fns";
import { confirm as promptConfirm } from "@clack/prompts";
import type { AgentConfig, AgentState, Priority, Task } from "./types.js";
import { formatForDisplay, summarizeNextOccurrences } from "./date.js";
import { MAX_DEFAULT_LINES } from "./constants.js";

export function findTask(state: AgentState, id: number): Task {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }
  return task;
}

export function applyPriority(input?: string | null): Priority {
  if (!input) return "medium";
  const normalized = input.trim().toLowerCase();
  switch (normalized) {
    case "l":
    case "low":
      return "low";
    case "m":
    case "med":
    case "medium":
      return "medium";
    case "h":
    case "hi":
    case "high":
    case "p2":
      return "high";
    case "u":
    case "urgent":
    case "critical":
    case "p0":
    case "p1":
      return "urgent";
    case "p3":
      return "medium";
    case "p4":
      return "low";
    default:
      throw new Error(`Invalid priority: "${input}"`);
  }
}

export function parseTags(input?: string | null): string[] {
  if (!input) return [];
  return input
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag))
    .map((tag) => tag.toLowerCase());
}

export function ensureLineLimit(lines: string[], options: { limit?: number }): string[] {
  const limit = options.limit ?? MAX_DEFAULT_LINES;
  if (lines.length <= limit) return lines;
  const trimmed = lines.slice(0, limit - 1);
  trimmed.push(`… truncated ${lines.length - trimmed.length} lines — use --verbose for full output`);
  return trimmed;
}

export async function confirmAmbiguousDate(candidate: string): Promise<boolean> {
  const result = await promptConfirm({
    message: `Date resolves to ${candidate}. Continue?`
  });
  return result === true;
}

export async function confirmDestructive(action: string, flag?: boolean): Promise<void> {
  if (flag) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${action} — re-run with --yes`);
  }
  const result = await promptConfirm({
    message: `${action} — continue?`,
    initialValue: false
  });
  if (result !== true) {
    throw new Error("Cancelled");
  }
}

export function buildTaskSummary(task: Task): string[] {
  const lines: string[] = [];
  lines.push(`[${task.id}] ${task.title}`);
  lines.push(`  status: ${task.status}`);
  if (task.due) {
    lines.push(`  due: ${formatForDisplay(task.due)}`);
  }
  lines.push(`  priority: ${task.priority}`);
  if (task.tags.length) {
    lines.push(`  tags: ${task.tags.join(", ")}`);
  }
  if (task.repeat) {
    lines.push(`  repeat: ${task.repeat}`);
    const next = summarizeNextOccurrences(task.repeat, task.due);
    if (next.length) {
      lines.push(`  next: ${next.join(", ")}`);
    }
  }
  if (task.notes) {
    lines.push(`  notes: ${task.notes}`);
  }
  lines.push(`  created: ${task.createdAt}`);
  lines.push(`  updated: ${task.updatedAt}`);
  if (task.history.length) {
    lines.push("  history:");
    for (const entry of task.history.slice(-5)) {
      lines.push(`    - ${entry.timestamp}: ${entry.action}${entry.details ? ` (${entry.details})` : ""}`);
    }
  }
  return lines;
}

export function showConfig(config: AgentConfig): string[] {
  const lines: string[] = [];
  lines.push("Configuration");
  lines.push(`  role: ${config.role}`);
  lines.push(`  theme: ${config.theme}`);
  lines.push(`  defaultPriority: ${config.defaultPriority}`);
  lines.push(`  timezone: ${config.timezone}`);
  if (Object.keys(config.integrations).length === 0) {
    lines.push("  integrations: none configured");
  } else {
    lines.push("  integrations:");
    for (const [key, value] of Object.entries(config.integrations)) {
      lines.push(`    - ${key}: ${value.enabled ? "enabled" : "disabled"}`);
    }
  }
  return lines;
}

export function isValidISODate(value?: string | null): boolean {
  if (!value) return false;
  const parsed = parseISO(value);
  return !Number.isNaN(parsed.getTime());
}

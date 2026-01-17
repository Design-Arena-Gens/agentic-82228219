import fs from "node:fs";
import { formatISO, isToday, parseISO } from "date-fns";
import minimist, { ParsedArgs } from "minimist";
import * as chrono from "chrono-node";
import { nanoid } from "nanoid";
import { readConfig, readState, writeConfig, writeState } from "./storage.js";
import type { AgentState, Priority, Task } from "./types.js";
import {
  applyPriority,
  buildTaskSummary,
  confirmAmbiguousDate,
  confirmDestructive,
  ensureLineLimit,
  findTask,
  parseTags,
  showConfig
} from "./command-utils.js";
import { formatHeader, formatSeparator, formatTaskRow } from "./formatter.js";
import { applySnooze, formatForDisplay, parseDateInput } from "./date.js";
import { logAudit } from "./logger.js";
import { AGENT_NAME } from "./constants.js";
import { setTheme } from "./theme.js";

type CommandHandler = (args: ParsedArgs, rest: string[]) => Promise<string[]>;

interface CommandDef {
  name: string;
  description: string;
  usage: string;
  examples?: string[];
  handler: CommandHandler;
}

const commands: Record<string, CommandDef> = {};

export function registerCommand(def: CommandDef): void {
  commands[def.name] = def;
}

export async function runCommand(argv: string[]): Promise<string> {
  if (!argv.length) {
    return helpOutput();
  }

  const helpIndex = argv.findIndex((arg) => arg === "--help" || arg === "-h");
  if (helpIndex >= 0) {
    if (helpIndex === 0) {
      const target = argv[1];
      return helpOutput(target);
    }
    const target = argv[0];
    return helpOutput(target);
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    const pkg = readPackageVersion();
    return `${pkg.name} ${pkg.version}`;
  }

  const [commandName, ...restArgs] = argv;
  const command = commands[commandName];
  if (!command) {
    throw new Error(`Unknown command: ${commandName}. Try "agent help".`);
  }
  await ensureThemeInitialized();

  const parsed = minimist(restArgs, minimistOptionsFor(commandName));
  const output = await command.handler(parsed, parsed._.map(String));
  const skipLimit =
    Boolean(parsed.verbose) ||
    (typeof parsed.format === "string" && ["json", "csv", "md"].includes(parsed.format));
  return ensureLineLimit(output, { limit: skipLimit ? Number.MAX_SAFE_INTEGER : undefined }).join("\n");
}

function minimistOptionsFor(commandName: string): minimist.Opts {
  switch (commandName) {
    case "add":
      return {
        string: ["due", "p", "priority", "tags", "repeat", "notes"],
        boolean: ["verbose"],
        alias: { priority: "p" },
        default: {}
      };
    case "list":
      return {
        string: ["status", "tag", "format", "sort"],
        boolean: ["verbose"],
        default: { status: "open" }
      };
    case "view":
      return { boolean: ["verbose"], default: {} };
    case "done":
      return { boolean: ["undo", "verbose"], default: {} };
    case "snooze":
      return { boolean: ["verbose"], default: {} };
    case "edit":
      return {
        string: ["title", "due", "priority", "tags", "repeat", "notes"],
        boolean: ["clear-due", "verbose"],
        alias: { priority: "p" },
        default: {}
      };
    case "search":
      return {
        string: ["format"],
        boolean: ["verbose"],
        default: {}
      };
    case "export":
      return {
        string: ["format"],
        boolean: ["yes", "verbose"],
        default: { format: "json" }
      };
    case "import":
      return {
        string: ["file"],
        boolean: ["yes", "verbose"],
        default: {}
      };
    case "config":
      return { boolean: ["verbose"], default: {} };
    case "sync":
      return { boolean: ["verbose"], default: {} };
    case "today":
      return { boolean: ["verbose"], default: {} };
    case "help":
      return { boolean: ["verbose"], default: {} };
    default:
      return { boolean: ["verbose"], default: {} };
  }
}

function helpOutput(command?: string): string {
  if (!command || !commands[command]) {
    const lines: string[] = [];
    lines.push(`${AGENT_NAME} commands`);
    lines.push("  add, list, view, done, snooze, edit, search");
    lines.push("  config, export, import, today, sync, help");
    lines.push("");
    lines.push('Use "agent help <command>" for details.');
    return lines.join("\n");
  }
  const { name, description, usage, examples } = commands[command];
  const lines: string[] = [];
  lines.push(`${name}: ${description}`);
  lines.push(`usage: ${usage}`);
  if (examples?.length) {
    lines.push("examples:");
    for (const example of examples) {
      lines.push(`  ${example}`);
    }
  }
  return lines.join("\n");
}

function readPackageVersion(): { name: string; version: string } {
  const name = process.env.npm_package_name ?? AGENT_NAME;
  const version = process.env.npm_package_version ?? "0.0.0";
  return { name, version };
}

let themeLoaded = false;

async function ensureThemeInitialized(): Promise<void> {
  if (themeLoaded) return;
  try {
    const config = await readConfig();
    setTheme(config.theme);
  } catch {
    setTheme("minimal");
  }
  themeLoaded = true;
}

export function setRuntimeTheme(theme?: string): void {
  if (theme) {
    setTheme(theme);
    themeLoaded = true;
  }
}

// --- Command implementations ---

registerCommand({
  name: "add",
  description: "Create a new task",
  usage: "agent add \"title\" [--due 2024-06-01] [--p high] [--tags tag1,tag2] [--repeat 2 weeks]",
  examples: [
    "agent add \"Pay rent next month\"",
    "agent add \"Write summary\" --due 2024-07-01 --p high --tags work",
    "agent add \"Water plants\" --repeat 1 week"
  ],
  handler: async (args) => {
    const config = await readConfig();
    const state = await readState();

    const [titleArg] = args._;
    const rawTitle = titleArg ?? "";
    const title = rawTitle.trim();
    if (!title) {
      throw new Error("Title is required: agent add \"Task title\"");
    }

    const explicitDue = args.due ? String(args.due) : undefined;
    const explicitPriority = (args.priority ?? args.p) as string | undefined;
    const explicitTags = args.tags ? parseTags(String(args.tags)) : [];

    const natural = extractMetadataFromTitle(title);
    let due = explicitDue ?? natural.due;
    let ambiguous = natural.ambiguous;

    if (due) {
      const { date, ambiguous: isAmbiguous } = parseDateInput(due);
      due = date;
      ambiguous = ambiguous || isAmbiguous;
      if (ambiguous) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
          const confirmed = await confirmAmbiguousDate(date);
          if (!confirmed) {
            throw new Error("Cancelled");
          }
        } else {
          throw new Error(`Ambiguous date "${due}" — please specify YYYY-MM-DD.`);
        }
      }
    }

    const priority = explicitPriority ? applyPriority(explicitPriority) : natural.priority ?? config.defaultPriority;
    const tags = [...explicitTags, ...natural.tags].filter((tag, index, arr) => arr.indexOf(tag) === index);

    const now = new Date().toISOString();
    const task: Task = {
      id: state.nextId++,
      title: natural.title,
      due: due ?? undefined,
      priority,
      tags,
      repeat: args.repeat ? String(args.repeat) : undefined,
      notes: args.notes ? String(args.notes) : undefined,
      status: "open",
      createdAt: now,
      updatedAt: now,
      history: [
        {
          timestamp: now,
          action: "created",
          details: `priority=${priority}${due ? ` due=${due}` : ""}`
        }
      ]
    };

    state.tasks.push(task);
    await writeState(state);
    await logAudit({ command: "add", details: JSON.stringify({ id: task.id }) });

    return [`✓ Task added: [${task.id}] ${task.title}${task.due ? ` — due ${task.due}` : ""}`];
  }
});

registerCommand({
  name: "list",
  description: "List tasks",
  usage: "agent list [--status open|done|all] [--tag focus] [--limit 20] [--format json|csv|md]",
  handler: async (args) => {
    const state = await readState();
    const status = (args.status as string | undefined) ?? "open";
    const tag = args.tag ? String(args.tag).toLowerCase() : undefined;
    const limitValue =
      args.limit !== undefined ? Number.parseInt(String(args.limit), 10) : Number.NaN;
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined;
    const format = args.format ? String(args.format) : undefined;
    const sort = (args.sort as string | undefined) ?? "due";

    let tasks = [...state.tasks].sort((a, b) => sortTasks(a, b, sort));
    tasks = tasks.filter((task) => {
      if (status === "all") return true;
      if (status === "done") return task.status === "done";
      return task.status === "open";
    });
    if (tag) {
      tasks = tasks.filter((task) => task.tags.includes(tag));
    }
    if (limit) {
      tasks = tasks.slice(0, limit);
    }

    if (format === "json") {
      return [JSON.stringify(tasks, null, 2)];
    }
    if (format === "csv") {
      const lines = [
        "id,title,due,priority,tags,status,repeat,createdAt,updatedAt",
        ...tasks.map((task) =>
          [
            task.id,
            quoteCsv(task.title),
            task.due ?? "",
            task.priority,
            quoteCsv(task.tags.join(";")),
            task.status,
            quoteCsv(task.repeat ?? ""),
            task.createdAt,
            task.updatedAt
          ].join(",")
        )
      ];
      return lines;
    }
    if (format === "md") {
      const lines = ["| ID | Title | Due | Pri | Tags | Status |", "| :- | :---- | :-: | :-: | :--- | :----- |"];
      for (const task of tasks) {
        lines.push(
          `| ${task.id} | ${task.title} | ${formatForDisplay(task.due)} | ${task.priority} | ${task.tags.join(
            ","
          )} | ${task.status} |`
        );
      }
      return lines;
    }

    const lines = [formatSeparator(), formatHeader(), formatSeparator()];
    for (const task of tasks) {
      lines.push(formatTaskRow(task));
    }
    lines.push(formatSeparator());
    return lines;
  }
});

registerCommand({
  name: "view",
  description: "View task details",
  usage: "agent view <id>",
  handler: async (args) => {
    const [idRaw] = args._;
    if (!idRaw) throw new Error("Task id required");
    const id = Number.parseInt(String(idRaw), 10);
    const state = await readState();
    const task = findTask(state, id);
    return buildTaskSummary(task);
  }
});

registerCommand({
  name: "done",
  description: "Mark a task complete",
  usage: "agent done <id> [--undo]",
  handler: async (args) => {
    const [idRaw] = args._;
    if (!idRaw) throw new Error("Task id required");
    const id = Number.parseInt(String(idRaw), 10);
    const undo = Boolean(args.undo);
    const state = await readState();
    const task = findTask(state, id);
    const now = new Date().toISOString();
    task.status = undo ? "open" : "done";
    task.updatedAt = now;
    if (undo) {
      task.completedAt = undefined;
      task.history.push({ timestamp: now, action: "reopened" });
    } else {
      task.completedAt = now;
      task.history.push({ timestamp: now, action: "completed" });
    }
    await writeState(state);
    await logAudit({ command: undo ? "done --undo" : "done", details: JSON.stringify({ id }) });
    return [`✓ Task ${undo ? "reopened" : "completed"}: [${task.id}] ${task.title}`];
  }
});

registerCommand({
  name: "snooze",
  description: "Snooze a task by duration (e.g. +3d, +1w)",
  usage: "agent snooze <id> +3d",
  handler: async (args) => {
    const [idRaw, duration] = args._.map(String);
    if (!idRaw || !duration) {
      throw new Error("Usage: agent snooze <id> +3d");
    }
    const id = Number.parseInt(idRaw, 10);
    const state = await readState();
    const task = findTask(state, id);
    const updatedDue = applySnooze(task.due, duration);
    const now = new Date().toISOString();
    task.due = updatedDue;
    task.snoozedUntil = updatedDue;
    task.updatedAt = now;
    task.history.push({ timestamp: now, action: "snoozed", details: duration });
    await writeState(state);
    await logAudit({ command: "snooze", details: JSON.stringify({ id, duration }) });
    return [`✓ Task snoozed: [${task.id}] now due ${updatedDue}`];
  }
});

registerCommand({
  name: "edit",
  description: "Edit a task's fields",
  usage: "agent edit <id> [--title ...] [--due ...] [--priority ...] [--tags ...] [--repeat ...] [--notes ...] [--clear-due]",
  handler: async (args) => {
    const [idRaw] = args._;
    if (!idRaw) throw new Error("Task id required");
    const id = Number.parseInt(String(idRaw), 10);
    const state = await readState();
    const task = findTask(state, id);
    const now = new Date().toISOString();
    const updates: string[] = [];

    if (args.title) {
      task.title = String(args.title);
      updates.push("title");
    }
    if (args.priority) {
      const priority = applyPriority(String(args.priority));
      task.priority = priority;
      updates.push(`priority=${priority}`);
    }
    if (args.tags) {
      task.tags = parseTags(String(args.tags));
      updates.push("tags");
    }
    if (args.repeat) {
      task.repeat = String(args.repeat);
      updates.push(`repeat=${task.repeat}`);
    }
    if (args.notes !== undefined) {
      task.notes = String(args.notes);
      updates.push("notes");
    }
    if (args["clear-due"]) {
      task.due = undefined;
      updates.push("due cleared");
    } else if (args.due) {
      const { date, ambiguous } = parseDateInput(String(args.due));
      if (ambiguous) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
          const confirmed = await confirmAmbiguousDate(date);
          if (!confirmed) {
            throw new Error("Cancelled");
          }
        } else {
          throw new Error(`Ambiguous date "${date}" — provide YYYY-MM-DD`);
        }
      }
      task.due = date;
      updates.push(`due=${date}`);
    }

    if (!updates.length) {
      return ["No changes applied."];
    }

    task.updatedAt = now;
    task.history.push({ timestamp: now, action: "edited", details: updates.join(", ") });
    await writeState(state);
    await logAudit({ command: "edit", details: JSON.stringify({ id, updates }) });
    return [`✓ Updated task [${task.id}]: ${updates.join(", ")}`];
  }
});

registerCommand({
  name: "search",
  description: "Search tasks by text",
  usage: "agent search <query> [--format json]",
  handler: async (args) => {
    const query = args._.join(" ").trim();
    if (!query) throw new Error("Search query required");
    const format = args.format ? String(args.format) : undefined;
    const state = await readState();
    const lower = query.toLowerCase();
    const matches = state.tasks.filter((task) => {
      return (
        task.title.toLowerCase().includes(lower) ||
        (task.notes ?? "").toLowerCase().includes(lower) ||
        task.tags.some((tag) => tag.includes(lower))
      );
    });
    if (format === "json") {
      return [JSON.stringify(matches, null, 2)];
    }
    const lines = [`Results: ${matches.length}`, formatSeparator(), formatHeader(), formatSeparator()];
    for (const task of matches) {
      lines.push(formatTaskRow(task));
    }
    lines.push(formatSeparator());
    return lines;
  }
});

registerCommand({
  name: "export",
  description: "Export tasks in a chosen format",
  usage: "agent export --format json|csv|md --yes",
  handler: async (args) => {
    const format = (args.format as string | undefined) ?? "json";
    const confirmFlag = Boolean(args.yes);
    await confirmDestructive("Exporting task data may expose sensitive info.", confirmFlag);
    const state = await readState();
    if (format === "json") {
      return [JSON.stringify(state.tasks, null, 2)];
    }
    if (format === "csv") {
      const lines = [
        "id,title,due,priority,tags,status",
        ...state.tasks.map((task) =>
          [
            task.id,
            quoteCsv(task.title),
            task.due ?? "",
            task.priority,
            quoteCsv(task.tags.join(";")),
            task.status
          ].join(",")
        )
      ];
      return lines;
    }
    if (format === "md") {
      const lines = ["| ID | Title | Due | Priority | Tags | Status |", "| :- | :---- | :- | :------ | :--- | :----- |"];
      for (const task of state.tasks) {
        lines.push(
          `| ${task.id} | ${task.title} | ${formatForDisplay(task.due)} | ${task.priority} | ${task.tags.join(
            ", "
          )} | ${task.status} |`
        );
      }
      return lines;
    }
    throw new Error(`Unsupported format: ${format}`);
  }
});

registerCommand({
  name: "import",
  description: "Import tasks from JSON with confirmation",
  usage: "agent import --file path/to.json --yes",
  handler: async (args) => {
    const file = args.file ? String(args.file) : undefined;
    if (!file) {
      throw new Error("Provide --file path for import data");
    }
    if (!fs.existsSync(file)) {
      throw new Error(`File not found: ${file}`);
    }
    const raw = fs.readFileSync(file, "utf-8");
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON: ${(error as Error).message}`);
    }
    if (!Array.isArray(payload)) {
      throw new Error("Import expects an array of tasks");
    }
    const preview = payload.slice(0, 3);
    const previewLines = preview.map((item, idx) => `  ${idx + 1}. ${(item as Task).title ?? "[missing title]"}`);
    if (!previewLines.length) {
      throw new Error("No tasks found in import file");
    }
    await confirmDestructive(
      `Import ${payload.length} tasks from ${file}? Preview:\n${previewLines.join("\n")}`,
      Boolean(args.yes)
    );
    const state = await readState();
    const now = new Date().toISOString();
    for (const rawTask of payload as Task[]) {
      const task: Task = {
        id: state.nextId++,
        title: rawTask.title ?? `Imported ${nanoid(4)}`,
        notes: rawTask.notes,
        due: rawTask.due,
        priority: (rawTask.priority as Priority) ?? "medium",
        tags: rawTask.tags ?? [],
        repeat: rawTask.repeat,
        status: rawTask.status === "done" ? "done" : "open",
        createdAt: now,
        updatedAt: now,
        history: [{ timestamp: now, action: "imported", details: file }]
      };
      state.tasks.push(task);
    }
    await writeState(state);
    await logAudit({ command: "import", details: JSON.stringify({ count: payload.length }) });
    return [`✓ Imported ${payload.length} tasks`];
  }
});

registerCommand({
  name: "config",
  description: "Show or set configuration",
  usage: "agent config [show]|set|get|integrations …",
  handler: async (args) => {
    const [sub, ...rest] = args._.map(String);
    const config = await readConfig();
    if (!sub || sub === "show") {
      return showConfig(config);
    }
    if (sub === "set") {
      const [key, value] = rest;
      if (!key || value === undefined) throw new Error("Usage: agent config set <key> <value>");
      switch (key) {
        case "role":
          if (!["tasks", "grocery", "finance", "habits", "email"].includes(value)) {
            throw new Error("role must be tasks|grocery|finance|habits|email");
          }
          config.role = value as typeof config.role;
          break;
        case "theme":
          if (!["minimal", "mono", "color"].includes(value)) {
            throw new Error("theme must be minimal|mono|color");
          }
          config.theme = value as typeof config.theme;
          setTheme(config.theme);
          break;
        case "defaultPriority":
          config.defaultPriority = value as Priority;
          break;
        case "timezone":
          config.timezone = value;
          break;
        default:
          throw new Error(`Unsupported config key: ${key}`);
      }
      await writeConfig(config);
      await logAudit({ command: "config set", details: JSON.stringify({ key, value }) });
      return [`✓ Updated ${key} -> ${value}`];
    }
    if (sub === "get") {
      const [key] = rest;
      if (!key) throw new Error("Usage: agent config get <key>");
      switch (key) {
        case "role":
          return [`role: ${config.role}`];
        case "theme":
          return [`theme: ${config.theme}`];
        case "defaultPriority":
          return [`defaultPriority: ${config.defaultPriority}`];
        case "timezone":
          return [`timezone: ${config.timezone}`];
        default:
          throw new Error(`Unsupported config key: ${key}`);
      }
    }
    if (sub === "integrations") {
      const [action, name] = rest;
      if (!action || !name) {
        throw new Error("Usage: agent config integrations <enable|disable|show> <name>");
      }
      const integration = config.integrations[name] ?? { enabled: false };
      if (action === "show") {
        return [
          `integration: ${name}`,
          `  enabled: ${integration.enabled}`,
          `  api key: ${integration.apiKey ? "[set]" : "[missing]"}`,
          "  run agent sync to trigger remote updates"
        ];
      }
      if (!["enable", "disable"].includes(action)) {
        throw new Error("Integration action must be enable or disable");
      }
      integration.enabled = action === "enable";
      config.integrations[name] = integration;
      await writeConfig(config);
      await logAudit({ command: `config integrations ${action}`, details: JSON.stringify({ name }) });
      return [
        `✓ ${action === "enable" ? "Enabled" : "Disabled"} integration: ${name}`,
        "Next steps:",
        "  1. Set API key via agent config integrations enable NAME key=<value>",
        "  2. Run agent sync --provider NAME"
      ];
    }
    throw new Error(`Unknown config action: ${sub}`);
  }
});

registerCommand({
  name: "sync",
  description: "Perform integrations sync or show setup help",
  usage: "agent sync [--provider google]",
  handler: async (args) => {
    const provider = args.provider ? String(args.provider) : undefined;
    const config = await readConfig();
    if (!provider) {
      return [
        "integration required",
        "  Configure via: agent config integrations enable <provider> key=<token>",
        "  Supported: google-calendar, gmail, notion, dropbox"
      ];
    }
    const integration = config.integrations[provider];
    if (!integration || !integration.enabled || !integration.apiKey) {
      return [
        "integration required",
        `  ${provider} is not fully configured.`,
        "  Steps:",
        `    - agent config integrations enable ${provider} key=<token>`,
        `    - rerun agent sync --provider ${provider}`
      ];
    }
    return [
      `Sync queued for ${provider}.`,
      "Remote operations are not executed automatically in offline mode."
    ];
  }
});

registerCommand({
  name: "today",
  description: "Show tasks relevant for today",
  usage: "agent today",
  handler: async () => {
    const state = await readState();
    const todayTasks = state.tasks.filter((task) => task.due && isToday(parseISO(task.due)) && task.status === "open");
    if (!todayTasks.length) {
      return ["No tasks due today."];
    }
    const lines: string[] = [];
    const segments: Record<string, Task[]> = { Morning: [], Afternoon: [], Evening: [], Anytime: [] };
    for (const task of todayTasks) {
      segments.Anytime.push(task);
    }
    for (const [period, tasks] of Object.entries(segments)) {
      if (!tasks.length) continue;
      lines.push(`${period}`);
      tasks.forEach((task) => lines.push(`  - [${task.id}] ${task.title} (${task.priority})`));
      lines.push("");
    }
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }
});

registerCommand({
  name: "help",
  description: "Show help",
  usage: "agent help [command]",
  handler: async (args) => {
    const [command] = args._.map(String);
    return helpOutput(command).split("\n");
  }
});

registerCommand({
  name: "--first-run",
  description: "First run onboarding",
  usage: "agent --first-run",
  handler: async () => {
    const examples = [
      "agent add \"Finish slides\" --due 2026-02-01 --p high --tags work,meeting",
      "agent list --limit 10",
      "agent view 3",
      "agent done 3",
      "agent snooze 4 +3d",
      "agent export --format csv --yes > tasks.csv"
    ];
    const lines = ["Welcome to agentic!", "", "Quick actions:"];
    examples.forEach((example) => lines.push(`  - ${example}`));
    lines.push("");
    lines.push("Try agent --help for full reference.");
    return lines;
  }
});

// --- helpers ---

function extractMetadataFromTitle(title: string): {
  title: string;
  due?: string;
  ambiguous: boolean;
  priority?: Priority;
  tags: string[];
} {
  const results = chrono.parse(title);
  let cleanTitle = title;
  let due: string | undefined;
  let ambiguous = false;
  if (results.length) {
    const best = results[0];
    due = formatISO(best.date(), { representation: "date" });
    ambiguous = !best.start.isCertain("day") || !best.start.isCertain("month") || !best.start.isCertain("year");
    cleanTitle =
      title.slice(0, best.index).trimEnd() + (title.slice(best.index + best.text.length).trimStart().length ? " " : "") +
      title.slice(best.index + best.text.length).trimStart();
    cleanTitle = cleanTitle.trim();
  }
  if (!cleanTitle) {
    cleanTitle = title;
  }

  const tags = (cleanTitle.match(/#\w+/g) ?? []).map((tag) => tag.slice(1).toLowerCase());
  cleanTitle = cleanTitle.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();

  const priorityMatch = cleanTitle.match(/\b(p\d|p[1-4]|low|medium|high|urgent)\b/i);
  let priority: Priority | undefined;
  if (priorityMatch) {
    try {
      priority = applyPriority(priorityMatch[0]);
      cleanTitle = cleanTitle.replace(priorityMatch[0], "").replace(/\s{2,}/g, " ").trim();
    } catch {
      // ignore
    }
  }

  return { title: cleanTitle, due, ambiguous, priority, tags };
}

function sortTasks(a: Task, b: Task, key: string): number {
  switch (key) {
    case "priority":
      return priorityRank(b.priority) - priorityRank(a.priority);
    case "created":
      return b.createdAt.localeCompare(a.createdAt);
    default:
      return (a.due ?? "").localeCompare(b.due ?? "");
  }
}

function priorityRank(priority: Priority): number {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function quoteCsv(value: string): string {
  if (value.includes(",") || value.includes("\"")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import type { Task } from "./types.js";
import { formatForDisplay } from "./date.js";
import { colorize, getTheme } from "./theme.js";

interface TableColumn {
  key: string;
  title: string;
  width: number;
}

const columns: TableColumn[] = [
  { key: "id", title: "ID", width: 4 },
  { key: "title", title: "Title", width: 32 },
  { key: "due", title: "Due", width: 12 },
  { key: "priority", title: "Pri", width: 6 },
  { key: "tags", title: "Tags", width: 18 },
  { key: "status", title: "Status", width: 10 }
];

function truncate(input: string, size: number): string {
  const raw = stripAnsi(input);
  if (stringWidth(raw) <= size) return input;
  let truncated = "";
  let current = 0;
  for (const char of raw) {
    const width = stringWidth(char);
    if (current + width >= size) {
      truncated += "…";
      break;
    }
    truncated += char;
    current += width;
  }
  return truncated;
}

function pad(input: string, size: number): string {
  const raw = stripAnsi(input);
  const padding = Math.max(size - stringWidth(raw), 0);
  return `${input}${" ".repeat(padding)}`;
}

export function formatTaskRow(task: Task): string {
  const theme = getTheme();
  const values: Record<string, string> = {
    id: `${task.id}`,
    title: task.title,
    due: formatForDisplay(task.due),
    priority: task.priority[0]?.toUpperCase() ?? "-",
    tags: task.tags.join(","),
    status: task.status === "done" ? "Done" : "Open"
  };
  if (theme === "color") {
    values.priority = colorize(values.priority, priorityColor(task.priority));
    values.status = task.status === "done" ? colorize(values.status, "green") : colorize(values.status, "cyan");
  }
  const row = columns
    .map((column) => {
      const base = values[column.key] ?? "";
      const truncated = truncate(base, column.width);
      return pad(truncated, column.width);
    })
    .join(" | ");
  return ` ${row}`;
}

function priorityColor(priority: Task["priority"]): "cyan" | "yellow" | "green" | "red" {
  switch (priority) {
    case "urgent":
      return "red";
    case "high":
      return "yellow";
    case "medium":
      return "green";
    default:
      return "cyan";
  }
}

export function formatHeader(): string {
  const header = columns
    .map((column) => pad(column.title, column.width))
    .join(" | ");
  return ` ${header}`;
}

export function formatSeparator(): string {
  const totalWidth =
    columns.reduce((acc, column) => acc + column.width, 0) + (columns.length - 1) * 3 + 2;
  return "-".repeat(totalWidth);
}

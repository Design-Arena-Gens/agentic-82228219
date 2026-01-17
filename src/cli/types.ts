export type Priority = "low" | "medium" | "high" | "urgent";

export type TaskStatus = "open" | "done";

export interface TaskHistoryEntry {
  timestamp: string;
  action: string;
  details?: string;
}

export interface Task {
  id: number;
  title: string;
  notes?: string;
  due?: string;
  priority: Priority;
  tags: string[];
  repeat?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  snoozedUntil?: string;
  history: TaskHistoryEntry[];
}

export interface AgentState {
  nextId: number;
  tasks: Task[];
}

export interface AgentConfig {
  role: "tasks" | "grocery" | "finance" | "habits" | "email";
  theme: "minimal" | "mono" | "color";
  defaultPriority: Priority;
  timezone: string;
  integrations: Record<string, IntegrationConfig>;
}

export interface IntegrationConfig {
  enabled: boolean;
  apiKey?: string;
  extra?: Record<string, string>;
}

export interface ExportOptions {
  format: "json" | "csv" | "md";
}

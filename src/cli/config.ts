import type { AgentConfig, IntegrationConfig } from "./types.js";
import { readConfig, writeConfig } from "./storage.js";
import { showConfig } from "./command-utils.js";

export async function handleConfigCommand(sub: string | undefined, args: string[]): Promise<string[]> {
  const config = await readConfig();
  if (!sub || sub === "show") {
    return showConfig(config);
  }
  switch (sub) {
    case "set": {
      const [key, value] = args;
      if (!key || value === undefined) {
        throw new Error("Usage: agent config set <key> <value>");
      }
      updateConfigKey(config, key, value);
      await writeConfig(config);
      return [`✓ Updated ${key} -> ${value}`];
    }
    case "get": {
      const [key] = args;
      if (!key) throw new Error("Usage: agent config get <key>");
      const current = getConfigValue(config, key);
      return [`${key}: ${current ?? "unset"}`];
    }
    case "integrations": {
      const [action, name, flag] = args;
      if (!action || !name) {
        throw new Error("Usage: agent config integrations <enable|disable|show> <name>");
      }
      if (action === "show") {
        const integration = config.integrations[name];
        if (!integration) {
          return [`integration ${name} not configured`];
        }
        return [
          `integration: ${name}`,
          `  enabled: ${integration.enabled}`,
          `  apiKey: ${integration.apiKey ? "[set]" : "[missing]"}`
        ];
      }
      if (!["enable", "disable"].includes(action)) {
        throw new Error("Integration action must be enable, disable, or show");
      }
      const existing: IntegrationConfig = config.integrations[name] ?? { enabled: false };
      existing.enabled = action === "enable";
      if (flag?.startsWith("key=")) {
        existing.apiKey = flag.slice(4);
      }
      config.integrations[name] = existing;
      await writeConfig(config);
      return [
        `✓ Integration ${name} ${existing.enabled ? "enabled" : "disabled"}`,
        existing.apiKey ? "  api key stored" : "  api key not set",
        "  Next steps:",
        `    - provide API credentials via agent config integrations enable ${name} key=<value>`,
        "    - run agent sync to perform the first sync"
      ];
    }
    default:
      throw new Error(`Unknown config subcommand: ${sub}`);
  }
}

function updateConfigKey(config: AgentConfig, key: string, value: string): void {
  switch (key) {
    case "role":
      if (!["tasks", "grocery", "finance", "habits", "email"].includes(value)) {
        throw new Error("role must be one of tasks|grocery|finance|habits|email");
      }
      config.role = value as AgentConfig["role"];
      break;
    case "theme":
      if (!["minimal", "mono", "color"].includes(value)) {
        throw new Error("theme must be minimal|mono|color");
      }
      config.theme = value as AgentConfig["theme"];
      break;
    case "defaultPriority":
      if (!["low", "medium", "high", "urgent"].includes(value)) {
        throw new Error("defaultPriority must be low|medium|high|urgent");
      }
      config.defaultPriority = value as AgentConfig["defaultPriority"];
      break;
    case "timezone":
      config.timezone = value;
      break;
    default:
      throw new Error(`Unsupported config key: ${key}`);
  }
}

function getConfigValue(config: AgentConfig, key: string): string | undefined {
  switch (key) {
    case "role":
      return config.role;
    case "theme":
      return config.theme;
    case "defaultPriority":
      return config.defaultPriority;
    case "timezone":
      return config.timezone;
    default:
      return undefined;
  }
}

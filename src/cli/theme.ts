type ThemeOption = "minimal" | "mono" | "color";

let currentTheme: ThemeOption = "minimal";

export function setTheme(theme: string | undefined): void {
  if (!theme) return;
  const normalized = theme.toLowerCase() as ThemeOption;
  if (["minimal", "mono", "color"].includes(normalized)) {
    currentTheme = normalized;
  }
}

export function getTheme(): ThemeOption {
  return currentTheme;
}

export function colorize(text: string, color: "cyan" | "yellow" | "green" | "red"): string {
  if (currentTheme !== "color") return text;
  const map: Record<typeof color, string> = {
    cyan: "\u001b[36m",
    yellow: "\u001b[33m",
    green: "\u001b[32m",
    red: "\u001b[31m"
  };
  return `${map[color]}${text}\u001b[0m`;
}

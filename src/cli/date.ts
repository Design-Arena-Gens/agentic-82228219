import type { Duration } from "date-fns";
import { add, formatISO, isValid, parseISO } from "date-fns";
import * as chrono from "chrono-node";

export function parseDateInput(
  input: string,
  opts: { reference?: Date; timezone?: string } = {}
): { date: string; ambiguous: boolean } {
  const reference = opts.reference ?? new Date();

  // ISO direct parse
  const isoCandidate = parseISO(input);
  if (isValid(isoCandidate) && /^\d{4}-\d{2}-\d{2}/.test(input.trim())) {
    return { date: formatISO(isoCandidate, { representation: "date" }), ambiguous: false };
  }

  const results = chrono.parse(input, reference);
  if (!results.length) {
    throw new Error(`Unable to parse date: "${input}"`);
  }

  const result = results[0];
  const inferred = result.date();
  const ambiguous =
    !result.start.isCertain("day") || !result.start.isCertain("month") || !result.start.isCertain("year");

  return { date: formatISO(inferred, { representation: "date" }), ambiguous };
}

export function formatForDisplay(input?: string | null): string {
  if (!input) return "-";
  const parsed = parseISO(input);
  if (!isValid(parsed)) return input;
  return formatISO(parsed, { representation: "date" });
}

export function applySnooze(date: string | undefined, delta: string): string {
  const parsed = date ? parseISO(date) : new Date();
  if (!isValid(parsed)) {
    throw new Error("Cannot snooze; invalid existing date");
  }
  const amount = parseDuration(delta);
  const updated = add(parsed, amount);
  return formatISO(updated, { representation: "date" });
}

export function parseDuration(input: string): Duration {
  const pattern = /([+-]?\d+)([dwmy])/gi;
  let match: RegExpExecArray | null;
  const duration: Duration = {};
  let consumed = 0;
  while ((match = pattern.exec(input))) {
    const value = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case "d":
        duration.days = (duration.days ?? 0) + value;
        break;
      case "w":
        duration.weeks = (duration.weeks ?? 0) + value;
        break;
      case "m":
        duration.months = (duration.months ?? 0) + value;
        break;
      case "y":
        duration.years = (duration.years ?? 0) + value;
        break;
      default:
        break;
    }
    consumed += match[0].length;
  }
  if (!consumed) {
    throw new Error(`Invalid duration: "${input}"`);
  }
  return duration;
}

export function summarizeNextOccurrences(repeat: string | undefined, base: string | undefined): string[] {
  if (!repeat || !base) return [];
  const occurrences: string[] = [];
  const parsedBase = parseISO(base);
  if (!isValid(parsedBase)) return occurrences;
  const match = repeat.match(/^(\d+)\s*(day|week|month|year)s?$/i);
  if (!match) return occurrences;
  const count = Number.parseInt(match[1], 10);
  const unit = match[2];
  let cursor = parsedBase;
  for (let i = 0; i < 3; i += 1) {
    cursor = add(cursor, {
      days: unit === "day" ? count : 0,
      weeks: unit === "week" ? count : 0,
      months: unit === "month" ? count : 0,
      years: unit === "year" ? count : 0
    });
    occurrences.push(formatISO(cursor, { representation: "date" }));
  }
  return occurrences;
}

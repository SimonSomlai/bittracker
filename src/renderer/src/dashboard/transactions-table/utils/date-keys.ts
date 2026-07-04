import { format, isValid, parse } from "date-fns";

export function parseDateKey(key: string): Date | undefined {
  if (!key) return undefined;
  const parsed = parse(key, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function transactionDateKey(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date.slice(0, 10);

  return toDateKey(parsed);
}

function formatChipDate(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return value;

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateRangeLabel(from: string, to: string) {
  if (from && to) return `${formatChipDate(from)} – ${formatChipDate(to)}`;
  if (from) return `From ${formatChipDate(from)}`;
  if (to) return `Until ${formatChipDate(to)}`;
  return "Date range";
}

import type { FiatCurrency } from "@/src/settings/utils/currency";
import { roundFiatAmount } from "@/utils/format";

export function effectiveValueAtDate(row: {
  valueAtDate: number | null;
  customValueAtDate?: number | null;
}) {
  return row.customValueAtDate ?? row.valueAtDate;
}

export function parseCustomValueInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true as const, value: null };
  const normalized = trimmed.replace(/,/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false as const, error: "Enter a valid amount" };
  }
  return { ok: true as const, value: roundFiatAmount(parsed) };
}

export function formatCustomValueDraft(value: number | null, _currency: FiatCurrency) {
  if (value == null) return "";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

import type { FiatCurrency } from "@/src/settings/utils/currency";

export function effectiveValueAtDate(row: {
  valueAtDate: number | null;
  customValueAtDate?: number | null;
}) {
  return row.customValueAtDate ?? row.valueAtDate;
}

function currencyLocale(currency: FiatCurrency): string {
  switch (currency) {
    case "EUR":
      return "de-DE";
    case "GBP":
      return "en-GB";
    case "USD":
      return "en-US";
  }
}

export function parseCustomValueInput(raw: string, currency: FiatCurrency) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true as const, value: null };

  let normalized: string;
  if (currency === "EUR") {
    if (trimmed.includes(",")) {
      // EUR format: "1.234,56" → strip thousands dots, replace decimal comma with dot
      normalized = trimmed.replace(/\./g, "").replace(",", ".");
    } else {
      // User typed without comma (e.g. "1234.56") — accept as-is
      normalized = trimmed;
    }
  } else {
    // USD / GBP: comma is thousands separator, dot is decimal
    normalized = trimmed.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false as const, error: "Enter a valid amount" };
  }
  return { ok: true as const, value: Math.round(parsed * 100) }; // store as cents
}

export function formatCustomValueDraft(cents: number | null, currency: FiatCurrency) {
  if (cents == null) return "";
  return (cents / 100).toLocaleString(currencyLocale(currency), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

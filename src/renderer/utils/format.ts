import type { FiatCurrency } from "@/src/settings/utils/currency";

const SATS_PER_BTC = 100_000_000;

export function formatBtc(satoshis: number) {
  return (Math.abs(satoshis) / SATS_PER_BTC).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

export function formatSats(satoshis: number) {
  return Math.abs(satoshis).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

export function formatMoney(cents: number | null | undefined, currency: FiatCurrency = "USD") {
  if (cents == null || Number.isNaN(cents)) return "—";
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatGainLossPercent(
  gain: number | null | undefined,
  costBasis: number | null | undefined,
) {
  if (
    gain == null ||
    costBasis == null ||
    Number.isNaN(gain) ||
    Number.isNaN(costBasis) ||
    costBasis <= 0
  ) {
    return null;
  }
  const pct = (gain / costBasis) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function gainLossLabel(gain: number | null | undefined) {
  if (gain == null || Number.isNaN(gain) || gain === 0) {
    return "Unrealized gain/loss";
  }
  return gain > 0 ? "Unrealized gain" : "Unrealized loss";
}

function gainLossClassName(value: number | null | undefined) {
  if (value == null || Number.isNaN(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-green-500" : "text-red-500";
}

export function formatGainLoss(
  gain: number | null | undefined,
  costBasis: number | null | undefined,
  currency: FiatCurrency = "USD",
) {
  if (gain == null || Number.isNaN(gain) || gain === 0) {
    return { text: "—", className: "text-muted-foreground" };
  }

  const pct = formatGainLossPercent(gain, costBasis);
  const text =
    pct != null ? `${formatMoney(gain, currency)} (${pct})` : formatMoney(gain, currency);

  return {
    text,
    className: gainLossClassName(gain),
  };
}

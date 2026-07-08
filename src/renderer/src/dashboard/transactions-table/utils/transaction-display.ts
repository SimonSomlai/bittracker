import { parseDateKey } from "./date-keys";

export function formatTransactionDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseDateKey(value);
    if (!parsed) return value;
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const datePart = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${datePart}, ${timePart}`;
}

export function transactionCurrentValue(
  btcAmount: number,
  currentBtcPrice: number | null | undefined,
) {
  if (currentBtcPrice == null || Number.isNaN(currentBtcPrice)) return null;
  return Math.round((Math.abs(btcAmount) * currentBtcPrice) / 100_000_000); // cents
}

export function transactionUnrealizedGain(
  valueAtDate: number | null | undefined,
  currentValue: number | null | undefined,
) {
  if (
    valueAtDate == null ||
    currentValue == null ||
    Number.isNaN(valueAtDate) ||
    Number.isNaN(currentValue)
  ) {
    return null;
  }
  return currentValue - valueAtDate;
}

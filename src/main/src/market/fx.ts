import fs from "node:fs";
import path from "node:path";
import type { FiatCurrency } from "../shared/currency";

type FxCurrency = Exclude<FiatCurrency, "USD">;

interface FxBundle {
  generatedAt: string;
  source: string;
  rates: Record<string, Partial<Record<FxCurrency, number>>>;
}

const fxPath = () => path.join(__dirname, "data", "fx-rates.json");

let fxBundle: FxBundle | null | undefined;
const sortedFxDates: string[] = [];

function loadFxBundle() {
  if (fxBundle !== undefined) return fxBundle;
  if (!fs.existsSync(fxPath())) {
    fxBundle = null;
    return fxBundle;
  }
  try {
    fxBundle = JSON.parse(fs.readFileSync(fxPath(), "utf8")) as FxBundle;
    sortedFxDates.length = 0;
    sortedFxDates.push(...Object.keys(fxBundle?.rates ?? {}).sort());
  } catch {
    fxBundle = null;
  }
  return fxBundle;
}

function ratesForDate(dateKey: string) {
  return loadFxBundle()?.rates[dateKey] ?? null;
}

function nearestFxRates(dateKey: string) {
  const direct = ratesForDate(dateKey);
  if (direct) return direct;

  const dates = sortedFxDates.length
    ? sortedFxDates
    : Object.keys(loadFxBundle()?.rates ?? {}).sort();
  if (dates.length === 0) return null;

  let lo = 0;
  let hi = dates.length - 1;
  let best: string | null = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = dates[mid];
    if (candidate <= dateKey) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best ? (loadFxBundle()?.rates[best] ?? null) : null;
}

export function getFxRate(dateKey: string, currency: FxCurrency) {
  return nearestFxRates(dateKey)?.[currency] ?? null;
}

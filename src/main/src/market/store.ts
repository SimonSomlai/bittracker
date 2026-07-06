import fs from "node:fs";
import path from "node:path";
import { getUserDataDir } from "../shared/paths";
import type { FiatCurrency } from "../shared/currency";
import { getFxRate } from "./fx";

export type DailyPrices = Partial<Record<FiatCurrency, number>>;

export interface BtcPriceBundle {
  generatedAt: string;
  source: string;
  startDate: string | null;
  endDate: string | null;
  prices: Record<string, DailyPrices>;
}

interface BtcPriceOverlay {
  shippedThrough: string | null;
  updatedAt: string;
  prices: Record<string, DailyPrices>;
}

export interface MarketDataMeta {
  lastAttempt: string | null;
  lastUpdate: string | null;
}

const shippedPath = () => path.join(__dirname, "data", "btc-prices.json");
const overlayPath = () => path.join(getUserDataDir(), "market-data", "btc-prices-diff.json");
const metaPath = () => path.join(getUserDataDir(), "market-data", "meta.json");

let shippedBundle: BtcPriceBundle | null | undefined;
let overlayBundle: BtcPriceOverlay | null | undefined;

export function todayDateKey() {
  return formatDateKey(new Date());
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function maxDateKey(dates: string[]) {
  if (dates.length === 0) return null;
  return [...dates].sort().at(-1) ?? null;
}

export function clearMarketDataCache() {
  shippedBundle = undefined;
  overlayBundle = undefined;
}

export function getShippedBtcBundle() {
  if (shippedBundle === undefined) {
    shippedBundle = readJsonFile<BtcPriceBundle>(shippedPath());
  }
  return shippedBundle;
}

export function getMarketDataMeta(): MarketDataMeta {
  const raw = readJsonFile<Partial<MarketDataMeta>>(metaPath());
  return {
    lastAttempt: raw?.lastAttempt ?? null,
    lastUpdate: raw?.lastUpdate ?? null,
  };
}

export function setMarketDataMeta(partial: Partial<MarketDataMeta>) {
  const next = { ...getMarketDataMeta(), ...partial };
  fs.mkdirSync(path.dirname(metaPath()), { recursive: true });
  fs.writeFileSync(metaPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function getBtcOverlay() {
  if (overlayBundle === undefined) {
    overlayBundle = readJsonFile<BtcPriceOverlay>(overlayPath());
  }
  return overlayBundle;
}

function getDayPrices(dateKey: string): DailyPrices | null {
  const overlay = getBtcOverlay()?.prices[dateKey];
  if (overlay) return overlay;
  return getShippedBtcBundle()?.prices[dateKey] ?? null;
}

function getCombinedBtcPrice(dateKey: string, currency: FiatCurrency) {
  const day = getDayPrices(dateKey);
  if (!day) return null;

  const direct = day[currency];
  if (direct != null) return direct;

  if (currency === "USD") return day.USD ?? null;

  const usd = day.USD;
  if (usd == null) return null;

  const rate = getFxRate(dateKey, currency);
  return rate != null ? usd * rate : null;
}

export function getBundledPrice(dateKey: string, currency: FiatCurrency = "USD") {
  return getCombinedBtcPrice(dateKey, currency);
}

export function getEffectiveBtcEndDate() {
  const shippedEnd = getShippedBtcBundle()?.endDate ?? null;
  const overlayEnd = maxDateKey(Object.keys(getBtcOverlay()?.prices ?? {}));
  if (shippedEnd && overlayEnd) {
    return shippedEnd > overlayEnd ? shippedEnd : overlayEnd;
  }
  return overlayEnd ?? shippedEnd;
}

export function saveBtcOverlay(prices: Record<string, DailyPrices>) {
  const existing = getBtcOverlay();
  const mergedPrices: Record<string, DailyPrices> = { ...(existing?.prices ?? {}) };
  for (const [dateKey, dayPrices] of Object.entries(prices)) {
    mergedPrices[dateKey] = { ...(mergedPrices[dateKey] ?? {}), ...dayPrices };
  }
  const overlay: BtcPriceOverlay = {
    shippedThrough: getShippedBtcBundle()?.endDate ?? existing?.shippedThrough ?? null,
    updatedAt: new Date().toISOString(),
    prices: mergedPrices,
  };
  fs.mkdirSync(path.dirname(overlayPath()), { recursive: true });
  fs.writeFileSync(overlayPath(), `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
  overlayBundle = overlay;
}

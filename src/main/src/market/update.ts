import type { FiatCurrency } from "../shared/currency";
import {
  addDays,
  getEffectiveBtcEndDate,
  getMarketDataMeta,
  saveBtcOverlay,
  setMarketDataMeta,
  todayDateKey,
  type DailyPrices,
} from "./store";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BLOCKCHAIN_CHART = "https://api.blockchain.info/charts/market-price";
const FIAT: FiatCurrency[] = ["USD", "EUR", "GBP"];

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

function toDateKey(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function toCoinGeckoDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}-${month}-${year}`;
}

function shouldRefresh(lastAttemptIso: string | null, effectiveEndDate: string | null) {
  const today = todayDateKey();
  if (!effectiveEndDate || effectiveEndDate < today) {
    return true;
  }
  if (!lastAttemptIso) return true;
  const lastAttempt = Date.parse(lastAttemptIso);
  if (Number.isNaN(lastAttempt)) return true;
  return Date.now() - lastAttempt > UPDATE_INTERVAL_MS;
}

function mergeOhlcCloses(candles: number[][]) {
  const prices: Record<string, number> = {};
  for (const candle of candles) {
    if (!Array.isArray(candle) || candle.length < 5) continue;
    const [timestampMs, , , , close] = candle;
    if (typeof timestampMs !== "number" || typeof close !== "number") continue;
    prices[new Date(timestampMs).toISOString().slice(0, 10)] = close;
  }
  return prices;
}

async function fetchCoinGeckoOhlc(currency: FiatCurrency) {
  const vs = currency.toLowerCase();
  const candles = await fetchJson<number[][]>(
    `${COINGECKO_BASE}/coins/bitcoin/ohlc?vs_currency=${vs}&days=365`,
    `CoinGecko OHLC ${currency}`,
  );
  return mergeOhlcCloses(candles);
}

async function fetchCoinGeckoHistoryDay(dateKey: string) {
  const data = await fetchJson<{
    market_data?: { current_price?: Partial<Record<"usd" | "eur" | "gbp", number>> };
  }>(
    `${COINGECKO_BASE}/coins/bitcoin/history?date=${toCoinGeckoDate(dateKey)}&localization=false`,
    `CoinGecko history ${dateKey}`,
  );
  const current = data.market_data?.current_price;
  if (current?.usd == null) return null;
  return {
    USD: current.usd,
    EUR: current.eur ?? undefined,
    GBP: current.gbp ?? undefined,
  } satisfies DailyPrices;
}

async function fetchBlockchainUsdSince(startDate: string, endDate: string) {
  if (startDate >= endDate) return {};

  const spanDays = Math.min(
    Math.max(
      Math.ceil(
        (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
          86_400_000,
      ) + 3,
      1,
    ),
    365,
  );

  const payload = await fetchJson<{ values?: Array<{ x: number; y: number }> }>(
    `${BLOCKCHAIN_CHART}?timespan=${spanDays}days&format=json&sampled=false`,
    "blockchain.info diff",
  );

  const prices: Record<string, number> = {};
  for (const point of payload.values ?? []) {
    if (typeof point?.x !== "number" || typeof point?.y !== "number") continue;
    const dateKey = toDateKey(point.x);
    if (dateKey <= startDate || dateKey > endDate) continue;
    prices[dateKey] = point.y;
  }
  return prices;
}

async function fetchDiffSince(startDate: string, endDate: string) {
  const merged: Record<string, DailyPrices> = {};

  const usdBlockchain = await fetchBlockchainUsdSince(startDate, endDate);
  for (const [dateKey, usd] of Object.entries(usdBlockchain)) {
    merged[dateKey] = { ...(merged[dateKey] ?? {}), USD: usd };
  }

  for (const currency of FIAT) {
    try {
      const ohlc = await fetchCoinGeckoOhlc(currency);
      for (const [dateKey, price] of Object.entries(ohlc)) {
        if (dateKey <= startDate || dateKey > endDate) continue;
        merged[dateKey] = { ...(merged[dateKey] ?? {}), [currency]: price };
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch {
      // OHLC is best-effort for recent days.
    }
  }

  let day = addDays(startDate, 1);
  while (day <= endDate) {
    if (!merged[day]?.EUR || !merged[day]?.GBP) {
      try {
        const history = await fetchCoinGeckoHistoryDay(day);
        if (history) {
          merged[day] = { ...(merged[day] ?? {}), ...history };
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {
        // Skip days outside CoinGecko's free history window or rate limits.
      }
    }
    day = addDays(day, 1);
  }

  return merged;
}

export async function updateMarketDataDiff(options?: { force?: boolean }) {
  const today = todayDateKey();
  const endDate = getEffectiveBtcEndDate();
  const { lastAttempt } = getMarketDataMeta();

  if (!options?.force && !shouldRefresh(lastAttempt, endDate)) {
    return {
      ok: true as const,
      skipped: true as const,
      days: 0,
    };
  }

  setMarketDataMeta({ lastAttempt: new Date().toISOString() });

  try {
    const startDate = endDate ?? addDays(today, -1);
    const prices = await fetchDiffSince(startDate, today);
    const days = Object.keys(prices).length;

    if (days > 0) {
      saveBtcOverlay(prices);
      setMarketDataMeta({ lastUpdate: new Date().toISOString() });
    }

    return {
      ok: true as const,
      skipped: false as const,
      days,
      through: today,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Market data update failed",
    };
  }
}

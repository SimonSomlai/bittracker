import { getBundledPrice, todayDateKey } from "./store";
import { getFxRate } from "./fx";
import type { FiatCurrency } from "../shared/currency";
import { getDatabase } from "../auth/db";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const SUPPORTED: FiatCurrency[] = ["USD", "EUR", "GBP"];

function toDateKey(isoDate: string) {
  return isoDate.slice(0, 10);
}

function toCoinGeckoDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}-${month}-${year}`;
}

function coinGeckoKey(currency: FiatCurrency) {
  return currency.toLowerCase() as "usd" | "eur" | "gbp";
}

type CachedDay = {
  usd_price: number;
  eur_price: number | null;
  gbp_price: number | null;
};

function cacheColumn(currency: FiatCurrency) {
  return `${coinGeckoKey(currency)}_price` as keyof CachedDay;
}

function getDbCachedDay(dateKey: string): CachedDay | null {
  const row = getDatabase()
    .prepare("SELECT usd_price, eur_price, gbp_price FROM price_cache WHERE date = ?")
    .get(dateKey) as CachedDay | undefined;
  return row ?? null;
}

function getCachedPriceForCurrency(dateKey: string, currency: FiatCurrency) {
  const cached = getDbCachedDay(dateKey);
  const column = cacheColumn(currency);
  const dbPrice = cached?.[column];
  if (dbPrice != null) return dbPrice;
  return getBundledPrice(dateKey, currency);
}

async function fetchPricesForDateFromCoinGecko(dateKey: string) {
  const response = await fetch(
    `${COINGECKO_BASE}/coins/bitcoin/history?date=${toCoinGeckoDate(dateKey)}&localization=false`,
  );
  if (!response.ok) {
    throw new Error(`CoinGecko request failed (${response.status})`);
  }
  const data = (await response.json()) as {
    market_data?: { current_price?: Partial<Record<"usd" | "eur" | "gbp", number>> };
  };
  const current = data.market_data?.current_price;
  const usd = current?.usd;
  if (usd == null) {
    throw new Error(`No CoinGecko price for ${dateKey}`);
  }
  return {
    USD: usd,
    EUR: current?.eur ?? null,
    GBP: current?.gbp ?? null,
  } satisfies Partial<Record<FiatCurrency, number | null>>;
}

function enrichWithFx(dateKey: string, prices: Partial<Record<FiatCurrency, number | null>>) {
  const usd = prices.USD;
  if (usd == null) return prices;

  const eur =
    prices.EUR ??
    (() => {
      const rate = getFxRate(dateKey, "EUR");
      return rate != null ? usd * rate : null;
    })();
  const gbp =
    prices.GBP ??
    (() => {
      const rate = getFxRate(dateKey, "GBP");
      return rate != null ? usd * rate : null;
    })();

  return { USD: usd, EUR: eur, GBP: gbp };
}

function cacheDayPrices(dateKey: string, prices: Partial<Record<FiatCurrency, number | null>>) {
  const existing = getDbCachedDay(dateKey);
  getDatabase()
    .prepare(
      `
      INSERT INTO price_cache (date, usd_price, eur_price, gbp_price)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        usd_price = excluded.usd_price,
        eur_price = COALESCE(excluded.eur_price, price_cache.eur_price),
        gbp_price = COALESCE(excluded.gbp_price, price_cache.gbp_price)
    `,
    )
    .run(
      dateKey,
      prices.USD ?? existing?.usd_price ?? 0,
      prices.EUR ?? existing?.eur_price ?? null,
      prices.GBP ?? existing?.gbp_price ?? null,
    );
}

export function getCachedPrice(dateKey: string, currency: FiatCurrency = "USD") {
  return getCachedPriceForCurrency(dateKey, currency);
}

function cacheFromBundledIfComplete(dateKey: string) {
  const usd = getBundledPrice(dateKey, "USD");
  if (usd == null) return false;

  const enriched = enrichWithFx(dateKey, {
    USD: usd,
    EUR: getBundledPrice(dateKey, "EUR"),
    GBP: getBundledPrice(dateKey, "GBP"),
  });
  if (enriched.EUR == null || enriched.GBP == null) return false;

  cacheDayPrices(dateKey, enriched);
  return true;
}

export function resolvePriceSource(dateKey: string, currency: FiatCurrency) {
  const cached = getDbCachedDay(dateKey);
  const column = cacheColumn(currency);
  const dbPrice = cached?.[column];
  if (dbPrice != null) return { price: dbPrice, source: "db" as const };

  const bundled = getBundledPrice(dateKey, currency);
  if (bundled != null) return { price: bundled, source: "bundled" as const };

  return { price: null, source: "missing" as const };
}

export async function ensurePricesForDates(dates: string[]) {
  const uniqueDates = [...new Set(dates.map(toDateKey))].sort();
  const missingDates = uniqueDates.filter((dateKey) =>
    SUPPORTED.some((currency) => getCachedPriceForCurrency(dateKey, currency) == null),
  );

  for (const dateKey of missingDates) {
    if (cacheFromBundledIfComplete(dateKey)) continue;

    try {
      const fetched = enrichWithFx(dateKey, await fetchPricesForDateFromCoinGecko(dateKey));
      cacheDayPrices(dateKey, fetched);
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch {
      if (cacheFromBundledIfComplete(dateKey)) continue;
      // Leave missing prices null; UI will show em dash.
    }
  }
}

export async function getCurrentBtcPrice(currency: FiatCurrency = "USD") {
  const today = todayDateKey();
  const cached = getCachedPriceForCurrency(today, currency);
  if (cached != null) return cached;

  try {
    const response = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp`,
    );
    if (!response.ok) {
      return getCachedPriceForCurrency(today, currency);
    }
    const data = (await response.json()) as {
      bitcoin?: Partial<Record<"usd" | "eur" | "gbp", number>>;
    };
    const prices = {
      USD: data.bitcoin?.usd ?? null,
      EUR: data.bitcoin?.eur ?? null,
      GBP: data.bitcoin?.gbp ?? null,
    };
    if (prices.USD != null) {
      cacheDayPrices(today, enrichWithFx(today, prices));
    }
    return prices[currency] ?? getCachedPriceForCurrency(today, currency);
  } catch {
    return getCachedPriceForCurrency(today, currency);
  }
}

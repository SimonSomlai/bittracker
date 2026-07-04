/**
 * Fetches daily BTC prices in USD, EUR, and GBP from CoinGecko (+ blockchain.info
 * for full USD history) into src/main/data/btc-prices.json.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "src/main/data/btc-prices.json");

const BLOCKCHAIN_CHART =
  "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const FIAT = ["USD", "EUR", "GBP"];

function toDateKey(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function toDateKeyFromMs(unixMs) {
  return new Date(unixMs).toISOString().slice(0, 10);
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.json();
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function emptyDay() {
  return {};
}

function mergeBlockchainUsd(values) {
  /** @type {Record<string, { USD: number }>} */
  const prices = {};
  for (const point of values) {
    if (typeof point?.x !== "number" || typeof point?.y !== "number") continue;
    prices[toDateKey(point.x)] = { USD: point.y };
  }
  return prices;
}

function mergeCoinGeckoOhlc(candles, currency) {
  const key = currency;
  for (const candle of candles) {
    if (!Array.isArray(candle) || candle.length < 5) continue;
    const [timestampMs, , , , close] = candle;
    if (typeof timestampMs !== "number" || typeof close !== "number") continue;
    const dateKey = toDateKeyFromMs(timestampMs);
    if (!prices[dateKey]) prices[dateKey] = emptyDay();
    prices[dateKey][key] = close;
  }
}

/** @type {Record<string, Record<string, number>>} */
let prices = {};

async function fetchCoinGeckoOhlc(currency) {
  const vs = currency.toLowerCase();
  console.log(`  CoinGecko OHLC ${currency} (365 days)…`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const ohlc = await fetchJson(
    `${COINGECKO_BASE}/coins/bitcoin/ohlc?vs_currency=${vs}&days=365`,
    `CoinGecko OHLC ${currency}`,
  );
  mergeCoinGeckoOhlc(ohlc, currency);
}

async function fetchBtcDiff(startDate, endDate) {
  const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
  const spanDays = Math.min(Math.max(Math.ceil((endMs - startMs) / 86_400_000) + 3, 1), 365);
  const payload = await fetchJson(
    `https://api.blockchain.info/charts/market-price?timespan=${spanDays}days&format=json&sampled=false`,
    "blockchain.info diff",
  );
  /** @type {Record<string, { USD: number }>} */
  const diff = {};
  for (const point of payload.values ?? []) {
    if (typeof point?.x !== "number" || typeof point?.y !== "number") continue;
    const dateKey = toDateKey(point.x);
    if (dateKey <= startDate || dateKey > endDate) continue;
    diff[dateKey] = { USD: point.y };
  }
  return diff;
}

async function main() {
  const diffOnly = process.argv.includes("--diff");
  const today = new Date().toISOString().slice(0, 10);

  if (diffOnly) {
    const existing = readJsonFile(outPath);
    const normalized = normalizeExisting(existing);
    if (!normalized?.endDate) {
      throw new Error("No shipped price bundle found. Run pnpm prices:fetch first.");
    }
    if (normalized.endDate >= today) {
      console.log(`Price data already through ${normalized.endDate}.`);
      return;
    }

    console.log(`Fetching diff ${normalized.endDate} → ${today}…`);
    prices = { ...normalized.prices };
    const usdDiff = await fetchBtcDiff(normalized.endDate, today);
    for (const [dateKey, day] of Object.entries(usdDiff)) {
      prices[dateKey] = { ...(prices[dateKey] ?? {}), ...day };
    }
    for (const currency of FIAT) {
      await fetchCoinGeckoOhlc(currency);
    }
    writeBundle();
    return;
  }

  console.log("Fetching blockchain.info daily BTC/USD prices…");
  const blockchain = await fetchJson(BLOCKCHAIN_CHART, "blockchain.info");
  prices = mergeBlockchainUsd(blockchain.values ?? []);
  console.log(`  ${Object.keys(prices).length} USD days`);

  for (const currency of FIAT) {
    try {
      await fetchCoinGeckoOhlc(currency);
    } catch (error) {
      console.warn(
        `  CoinGecko OHLC ${currency} skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  writeBundle();

  console.log("Fetching OFX FX rates…");
  spawnSync("node", ["scripts/fetch-fx-rates.mjs"], { cwd: root, stdio: "inherit" });
}

function normalizeExisting(raw) {
  if (!raw?.prices) return null;
  /** @type {Record<string, Record<string, number>>} */
  const normalized = {};
  for (const [dateKey, value] of Object.entries(raw.prices)) {
    if (typeof value === "number") {
      normalized[dateKey] = { USD: value };
    } else if (value && typeof value === "object") {
      normalized[dateKey] = value;
    }
  }
  const dates = Object.keys(normalized).sort();
  return {
    ...raw,
    startDate: raw.startDate ?? dates[0] ?? null,
    endDate: raw.endDate ?? dates.at(-1) ?? null,
    prices: normalized,
  };
}

function writeBundle() {
  const sortedDates = Object.keys(prices).sort();
  const bundle = {
    generatedAt: new Date().toISOString(),
    source: "blockchain.info-usd+coingecko-multi",
    startDate: sortedDates[0] ?? null,
    endDate: sortedDates.at(-1) ?? null,
    prices,
  };
  writeJson(outPath, bundle);
  console.log(`Wrote ${sortedDates.length} days to ${path.relative(root, outPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

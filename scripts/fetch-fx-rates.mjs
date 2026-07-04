/**
 * Fetches USD→EUR/GBP daily interbank rates from OFX into src/main/data/fx-rates.json,
 * then backfills missing EUR/GBP in btc-prices.json from USD × FX rate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fxOutPath = path.join(root, "src/main/data/fx-rates.json");
const btcOutPath = path.join(root, "src/main/data/btc-prices.json");

const OFX_BASE = "https://api.ofx.com/PublicSite.ApiService/SpotRateHistory";
const OFX_HEADERS = {
  accept: "*/*",
  origin: "https://www.ofx.com",
  referer: "https://www.ofx.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
};

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function dateKeyFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function msFromDateKey(dateKey) {
  return Date.parse(`${dateKey}T00:00:00.000Z`);
}

async function fetchOfxPair(from, to, startMs, endMs) {
  const url =
    `${OFX_BASE}/${from}/${to}/${startMs}/${endMs}` +
    "?DecimalPlaces=6&ReportingInterval=daily&format=json";
  const response = await fetch(url, { headers: OFX_HEADERS });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OFX ${from}/${to} failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  return payload.HistoricalPoints ?? [];
}

function mergeOfxPoints(points, currency, rates) {
  for (const point of points) {
    if (typeof point?.PointInTime !== "number" || typeof point?.InterbankRate !== "number") {
      continue;
    }
    const dateKey = dateKeyFromMs(point.PointInTime);
    if (!rates[dateKey]) rates[dateKey] = {};
    rates[dateKey][currency] = point.InterbankRate;
  }
}

async function fetchAllFxRates(startDate, endDate) {
  const startMs = msFromDateKey(startDate);
  const endMs = msFromDateKey(endDate);

  console.log(`  OFX USD/EUR ${startDate} → ${endDate}…`);
  const eurPoints = await fetchOfxPair("USD", "EUR", startMs, endMs);

  console.log(`  OFX USD/GBP ${startDate} → ${endDate}…`);
  const gbpPoints = await fetchOfxPair("USD", "GBP", startMs, endMs);

  /** @type {Record<string, { EUR?: number, GBP?: number }>} */
  const rates = {};
  mergeOfxPoints(eurPoints, "EUR", rates);
  mergeOfxPoints(gbpPoints, "GBP", rates);
  return rates;
}

function backfillBtcPrices(fxRates) {
  const bundle = readJsonFile(btcOutPath);
  if (!bundle?.prices) {
    console.log("No btc-prices.json found; skipping EUR/GBP backfill.");
    return;
  }

  let eurFilled = 0;
  let gbpFilled = 0;

  for (const [dateKey, day] of Object.entries(bundle.prices)) {
    if (!day || typeof day !== "object") continue;
    const usd = day.USD;
    if (usd == null) continue;

    const fx = fxRates[dateKey];
    if (!fx) continue;

    if (fx.EUR != null) {
      day.EUR = usd * fx.EUR;
      eurFilled += 1;
    }
    if (fx.GBP != null) {
      day.GBP = usd * fx.GBP;
      gbpFilled += 1;
    }
  }

  const dates = Object.keys(bundle.prices).sort();
  bundle.generatedAt = new Date().toISOString();
  bundle.startDate = dates[0] ?? bundle.startDate ?? null;
  bundle.endDate = dates.at(-1) ?? bundle.endDate ?? null;
  writeJson(btcOutPath, bundle);
  console.log(`Applied OFX to ${eurFilled} EUR and ${gbpFilled} GBP days in btc-prices.json`);
}

async function main() {
  const startDate = process.argv[2] ?? "2009-01-01";
  const endDate = process.argv[3] ?? new Date().toISOString().slice(0, 10);

  console.log(`Fetching OFX USD→EUR/GBP ${startDate} → ${endDate}…`);
  const rates = await fetchAllFxRates(startDate, endDate);
  const sortedDates = Object.keys(rates).sort();

  writeJson(fxOutPath, {
    generatedAt: new Date().toISOString(),
    source: "api.ofx.com",
    startDate: sortedDates[0] ?? null,
    endDate: sortedDates.at(-1) ?? null,
    rates,
  });

  console.log(`Wrote ${sortedDates.length} FX days to ${path.relative(root, fxOutPath)}`);
  backfillBtcPrices(rates);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

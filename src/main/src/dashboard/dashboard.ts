import { getDatabase, type WalletRecord } from "../auth/db";
import type { FiatCurrency } from "../shared/currency";
import { parseCurrency, roundFiatAmount } from "../shared/currency";
import fs from "node:fs";
import path from "node:path";
import {
  ensurePricesForDates,
  getCachedPrice,
  getCurrentBtcPrice,
  resolvePriceSource,
} from "../market/price";
import { addDays, getShippedBtcBundle, todayDateKey } from "../market/store";
import { buildDashboardRows, type DashboardRow } from "../transactions/transactions";
import { toWalletDto } from "../wallets/wallet";

interface ChartSeriesPoint {
  date: string;
  btcPrice: number | null;
  portfolioValue: number | null;
  cumulativeBtc: number | null;
}

interface ChartMarker {
  date: string;
  btcPrice: number | null;
  portfolioValue: number | null;
  flow: "inflow" | "outflow";
  btcAmount: number;
  walletName: string;
}

function eachDateKey(from: string, to: string): string[] {
  if (from > to) return [];
  const keys: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function fillChartSeriesPrices(
  series: ChartSeriesPoint[],
  currentBtcPrice: number | null,
  today: string,
  totalBtc: number,
) {
  let lastPrice: number | null = null;

  for (const point of series) {
    if (point.btcPrice != null) {
      lastPrice = point.btcPrice;
    } else if (lastPrice != null) {
      point.btcPrice = lastPrice;
    }
  }

  for (const point of series) {
    if (point.btcPrice != null && point.cumulativeBtc != null) {
      point.portfolioValue = point.cumulativeBtc * point.btcPrice;
    }
  }

  let todayPoint = series.find((point) => point.date === today);
  if (!todayPoint) {
    todayPoint = {
      date: today,
      btcPrice: currentBtcPrice,
      portfolioValue: null,
      cumulativeBtc: totalBtc,
    };
    series.push(todayPoint);
    series.sort((left, right) => left.date.localeCompare(right.date));
  }

  todayPoint.cumulativeBtc = totalBtc;
  if (currentBtcPrice != null) {
    todayPoint.btcPrice = currentBtcPrice;
    todayPoint.portfolioValue = totalBtc * currentBtcPrice;
  } else if (todayPoint.btcPrice != null) {
    todayPoint.portfolioValue = totalBtc * todayPoint.btcPrice;
  }
}

function buildChart(
  rows: DashboardRow[],
  currency: FiatCurrency,
  currentBtcPrice: number | null = null,
  totalBtc = 0,
) {
  const markers: ChartMarker[] = [];

  for (const row of rows) {
    if (row.btcAmount === 0) continue;

    const dateKey = row.date.slice(0, 10);
    markers.push({
      date: dateKey,
      btcPrice: row.priceAtDate,
      portfolioValue: row.portfolioValue,
      flow: row.flow,
      btcAmount: Math.abs(row.btcAmount),
      walletName: row.walletName,
    });
  }

  if (rows.length === 0) {
    return { series: [], markers };
  }

  const firstDate = rows[0]!.date.slice(0, 10);
  const today = todayDateKey();
  const dateKeys = eachDateKey(firstDate, today);
  let txIndex = 0;
  let lastCumulative = 0;
  const series: ChartSeriesPoint[] = [];

  for (const dateKey of dateKeys) {
    while (txIndex < rows.length && rows[txIndex]!.date.slice(0, 10) <= dateKey) {
      lastCumulative = rows[txIndex]!.cumulativeBtc;
      txIndex += 1;
    }

    const btcPrice = getCachedPrice(dateKey, currency);

    series.push({
      date: dateKey,
      btcPrice,
      portfolioValue: btcPrice != null ? lastCumulative * btcPrice : null,
      cumulativeBtc: lastCumulative,
    });
  }

  fillChartSeriesPrices(series, currentBtcPrice, today, totalBtc);

  return { series, markers };
}

function logChartData(currency: FiatCurrency, chart: ReturnType<typeof buildChart>) {
  const dataDir = path.join(__dirname, "data");
  const btcPath = path.join(dataDir, "btc-prices.json");
  const fxPath = path.join(dataDir, "fx-rates.json");
  const shipped = getShippedBtcBundle();
  const shippedDays = Object.keys(shipped?.prices ?? {}).length;
  const shippedWithCurrency = Object.values(shipped?.prices ?? {}).filter(
    (day) => day?.[currency] != null,
  ).length;

  console.log(
    `[chart] currency=${currency} series=${chart.series.length} markers=${chart.markers.length} ` +
      `inflows=${chart.markers.filter((m) => m.flow === "inflow").length} ` +
      `outflows=${chart.markers.filter((m) => m.flow === "outflow").length} ` +
      `priced=${chart.series.filter((point) => point.btcPrice != null).length} ` +
      `unpriced=${chart.series.filter((point) => point.btcPrice == null).length}`,
  );
  console.log(
    `[chart] data files: btc-prices=${fs.existsSync(btcPath) ? "yes" : "MISSING"} ` +
      `fx-rates=${fs.existsSync(fxPath) ? "yes" : "MISSING"} ` +
      `shippedDays=${shippedDays} shipped${currency}=${shippedWithCurrency}`,
  );

  for (const [index, marker] of chart.markers.entries()) {
    const resolved = resolvePriceSource(marker.date, currency);
    console.log(
      `[chart][marker ${index}] date=${marker.date} flow=${marker.flow} ` +
        `btc=${marker.btcAmount} btcPrice=${marker.btcPrice ?? "null"} ` +
        `wallet=${marker.walletName} priceSource=${resolved.source}`,
    );
  }
}

export async function getDashboardData(currencyInput: unknown = "USD") {
  const currency = parseCurrency(currencyInput);
  const db = getDatabase();
  const wallets = (db.prepare("SELECT * FROM wallets ORDER BY id").all() as WalletRecord[]).map(
    toWalletDto,
  );
  const txDates = db.prepare("SELECT date FROM transactions").all() as Array<{ date: string }>;
  await ensurePricesForDates([...txDates.map((row) => row.date), todayDateKey()]);

  // const { backfilled, removedRbf } = await maintainTransactionIntegrity(db);

  const { rows, totalBtc, totalCostBasis } = buildDashboardRows(currency);
  const currentBtcPrice = await getCurrentBtcPrice(currency);
  const currentPortfolioValue =
    currentBtcPrice != null ? roundFiatAmount(totalBtc * currentBtcPrice) : null;
  const unrealizedGain =
    currentPortfolioValue != null ? roundFiatAmount(currentPortfolioValue - totalCostBasis) : 0;

  const chart = buildChart(rows, currency, currentBtcPrice, totalBtc);
  logChartData(currency, chart);

  return {
    summary: {
      totalBtc,
      totalCostBasis,
      currentPortfolioValue: currentPortfolioValue ?? 0,
      unrealizedGain,
      currentBtcPrice,
      currency,
    },
    transactions: [...rows].reverse(),
    chart,
    wallets,
  };
}

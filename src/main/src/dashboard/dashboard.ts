import { getDatabase, type WalletRecord } from "../auth/db";
import type { FiatCurrency } from "../shared/currency";
import { parseCurrency } from "../shared/currency";
import {
  ensurePricesForDates,
  getCachedPrice,
  getCurrentBtcPrice,
} from "../market/price";
import { addDays, todayDateKey } from "../market/store";
import { getRawTransactionRows } from "../transactions/transactions";
import { toWalletDto } from "../wallets/wallet";

export interface ChartSeriesPoint {
  date: string;
  btcPrice: number | null;
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

export async function getDashboardData(currencyInput: unknown = "USD") {
  const currency = parseCurrency(currencyInput);
  const db = getDatabase();
  const wallets = (db.prepare("SELECT * FROM wallets ORDER BY id").all() as WalletRecord[]).map(
    toWalletDto,
  );
  const txDates = db.prepare("SELECT date FROM transactions").all() as Array<{ date: string }>;
  await ensurePricesForDates([...txDates.map((row) => row.date), todayDateKey()]);

  const rawRows = getRawTransactionRows(currency);
  const currentBtcPrice = await getCurrentBtcPrice(currency);

  // Build price series from first transaction date to today
  const priceSeries: ChartSeriesPoint[] = [];
  if (rawRows.length > 0) {
    const firstDate = rawRows[0]!.date.slice(0, 10);
    const today = todayDateKey();
    const dateKeys = eachDateKey(firstDate, today);
    for (const dateKey of dateKeys) {
      priceSeries.push({
        date: dateKey,
        btcPrice: getCachedPrice(dateKey, currency),
      });
    }
  }

  return {
    priceSeries,
    transactions: [...rawRows].reverse(),
    currentBtcPrice,
    wallets,
    currency,
  };
}

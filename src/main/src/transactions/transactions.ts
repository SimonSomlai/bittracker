import type Database from "better-sqlite3-multiple-ciphers";
import { dialog } from "electron";
import ExcelJS from "exceljs";
import fs from "node:fs";
import { cleanupAllWalletRbfDuplicates, inputOutpoints, serializeOutpoints } from "../chain/rbf";
import { EsploraClient, fetchCachedTx, type EsploraTx } from "../chain/esplora";
import type { FiatCurrency } from "../shared/currency";
import { parseCurrency } from "../shared/currency";
import { getDatabase } from "../auth/db";
import { ensurePricesForDates, getCachedPrice, getCurrentBtcPrice } from "../market/price";

type TransactionFlow = "inflow" | "outflow";

export interface RawTransactionRow {
  id: number;
  walletId: number;
  walletName: string;
  txid: string;
  date: string;
  btcAmount: number;
  flow: TransactionFlow;
  address: string;
  voutIndex: number | null;
  priceAtDate: number | null;
  valueAtDate: number | null;
  customValueAtDate: number | null;
  blockHeight: number;
}

type StoredTransactionRow = {
  id: number;
  wallet_id: number;
  wallet_name: string;
  txid: string;
  date: string;
  btc_amount: number;
  flow: TransactionFlow;
  address: string;
  vout_index: number | null;
  block_height: number;
  custom_value_at_date: string | null;
};

const DEDUPED_TRANSACTIONS_SQL = `
  SELECT
    t.id,
    t.wallet_id,
    w.name AS wallet_name,
    t.txid,
    t.date,
    t.btc_amount,
    t.flow,
    t.address,
    t.vout_index,
    t.block_height,
    t.custom_value_at_date
  FROM transactions t
  JOIN (
    SELECT wallet_id, txid, MAX(id) AS id
    FROM transactions
    GROUP BY wallet_id, txid
  ) deduped ON deduped.id = t.id
  JOIN wallets w ON w.id = t.wallet_id
  ORDER BY t.date ASC, t.flow ASC, t.id ASC
`;

type CustomValuesAtDate = Partial<Record<FiatCurrency, number>>;

function parseCustomValuesAtDate(raw: string | null | undefined): CustomValuesAtDate {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CustomValuesAtDate;
  } catch {
    return {};
  }
}

function readCustomValueAtDate(raw: string | null | undefined, currency: FiatCurrency) {
  const value = parseCustomValuesAtDate(raw)[currency];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function serializeCustomValuesAtDate(values: CustomValuesAtDate) {
  const entries = Object.entries(values).filter(
    (entry): entry is [FiatCurrency, number] =>
      (entry[0] === "USD" || entry[0] === "EUR" || entry[0] === "GBP") &&
      typeof entry[1] === "number" &&
      Number.isFinite(entry[1]),
  );
  if (entries.length === 0) return null;
  return JSON.stringify(Object.fromEntries(entries));
}

function mapRawTransactionRow(row: StoredTransactionRow, currency: FiatCurrency): RawTransactionRow {
  const dateKey = row.date.slice(0, 10);
  const priceAtDate = getCachedPrice(dateKey, currency);
  const flow =
    row.flow === "outflow" || row.flow === "Outflow"
      ? "outflow"
      : row.btc_amount < 0
        ? "outflow"
        : "inflow";
  const magnitude = Math.abs(row.btc_amount);
  const signedAmount = flow === "outflow" ? -magnitude : magnitude;
  const valueAtDate = priceAtDate != null ? Math.round((magnitude * priceAtDate) / 100_000_000) : null;

  return {
    id: row.id,
    walletId: row.wallet_id,
    walletName: row.wallet_name,
    txid: row.txid,
    date: row.date,
    btcAmount: signedAmount,
    flow,
    address: row.address,
    voutIndex: row.vout_index,
    priceAtDate,
    valueAtDate,
    customValueAtDate: readCustomValueAtDate(row.custom_value_at_date, currency),
    blockHeight: row.block_height,
  };
}

function loadStoredTransactionRows(db: Database.Database) {
  return db.prepare(DEDUPED_TRANSACTIONS_SQL).all() as StoredTransactionRow[];
}

export function getRawTransactionRows(currency: FiatCurrency = "USD", transactionIds?: number[]): RawTransactionRow[] {
  const rows = loadStoredTransactionRows(getDatabase());
  const idSet = transactionIds && transactionIds.length > 0 ? new Set(transactionIds) : null;
  const filteredRows = idSet ? rows.filter((row) => idSet.has(row.id)) : rows;
  return filteredRows.map((row) => mapRawTransactionRow(row, currency));
}

function transactionCurrentValue(btcAmount: number, currentBtcPrice: number | null) {
  return currentBtcPrice != null
    ? Math.round((Math.abs(btcAmount) * currentBtcPrice) / 100_000_000)
    : null;
}

function transactionUnrealizedGain(valueAtDate: number | null, currentValue: number | null) {
  if (valueAtDate == null || currentValue == null) return null;
  return currentValue - valueAtDate;
}

type BtcDisplayUnit = "sats" | "btc";

function parseBtcDisplayUnit(value: unknown): BtcDisplayUnit {
  return value === "btc" ? "btc" : "sats";
}

function exportHeaders(currency: FiatCurrency, btcUnit: BtcDisplayUnit) {
  return [
    "Date",
    "Type",
    "Wallet",
    btcUnit === "sats" ? "Sats" : "BTC Amount",
    "Cost basis",
    `${currency} value`,
    `Unrealized gain/loss (${currency})`,
  ];
}

function roundSignedBtc(value: number, btcUnit: BtcDisplayUnit) {
  const sign = Math.sign(value);
  if (sign === 0) return 0;
  if (btcUnit === "sats") return value; // already integer satoshis
  return sign * (Math.abs(value) / 1e8); // convert to BTC
}

function formatExportFiat(value: number) {
  return value.toFixed(2);
}

function exportRowValues(
  row: RawTransactionRow,
  currentBtcPrice: number | null,
  btcUnit: BtcDisplayUnit,
) {
  const currentValueCents = transactionCurrentValue(row.btcAmount, currentBtcPrice);
  const valueAtDateCents = row.customValueAtDate ?? row.valueAtDate;
  const unrealizedGainCents = transactionUnrealizedGain(valueAtDateCents, currentValueCents);

  return {
    date: row.date,
    flow: row.flow,
    walletName: row.walletName,
    btcAmount: roundSignedBtc(row.btcAmount, btcUnit),
    valueAtDate: valueAtDateCents != null ? valueAtDateCents / 100 : null,
    currentValue: currentValueCents != null ? currentValueCents / 100 : null,
    unrealizedGain: unrealizedGainCents != null ? unrealizedGainCents / 100 : null,
  };
}

function exportRowCsvValues(
  row: RawTransactionRow,
  currentBtcPrice: number | null,
  btcUnit: BtcDisplayUnit,
) {
  const values = exportRowValues(row, currentBtcPrice, btcUnit);
  return [
    values.date,
    values.flow,
    values.walletName,
    values.btcAmount,
    values.valueAtDate != null ? formatExportFiat(values.valueAtDate) : null,
    values.currentValue != null ? formatExportFiat(values.currentValue) : null,
    values.unrealizedGain != null ? formatExportFiat(values.unrealizedGain) : null,
  ];
}

async function backfillMissingTransactionOutpoints(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT wallet_id, txid
       FROM transactions
       WHERE input_outpoints IS NULL OR input_outpoints = ''`,
    )
    .all() as Array<{ wallet_id: number; txid: string }>;

  if (rows.length === 0) return 0;

  const client = new EsploraClient();
  const cache = new Map<string, EsploraTx>();
  const update = db.prepare(`
    UPDATE transactions
    SET input_outpoints = ?
    WHERE wallet_id = ? AND txid = ?
  `);

  for (const row of rows) {
    const tx = await fetchCachedTx(client, cache, row.txid);
    update.run(serializeOutpoints(inputOutpoints(tx)), row.wallet_id, row.txid);
  }

  return rows.length;
}

export async function maintainTransactionIntegrity(db: Database.Database) {
  const backfilled = await backfillMissingTransactionOutpoints(db);
  const removedRbf = cleanupAllWalletRbfDuplicates(db);
  return { backfilled, removedRbf };
}

async function rowsForExport(
  currencyInput: unknown = "USD",
  transactionIds?: number[],
  btcUnitInput?: unknown,
) {
  const currency = parseCurrency(currencyInput);
  const btcUnit = parseBtcDisplayUnit(btcUnitInput);
  const db = getDatabase();
  const txDates = db.prepare("SELECT date FROM transactions").all() as Array<{ date: string }>;
  await ensurePricesForDates(txDates.map((row) => row.date));
  const currentBtcPrice = await getCurrentBtcPrice(currency);
  const rows = getRawTransactionRows(currency, transactionIds);
  return { rows, currency, currentBtcPrice, btcUnit };
}

function escapeCsv(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  // Prefix formula-injection triggers so spreadsheets treat the cell as text
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export async function exportCsv(
  currencyInput: unknown = "USD",
  transactionIds?: number[],
  btcUnitInput?: unknown,
) {
  const { rows, currency, currentBtcPrice, btcUnit } = await rowsForExport(
    currencyInput,
    transactionIds,
    btcUnitInput,
  );
  const headers = exportHeaders(currency, btcUnit);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      exportRowCsvValues(row, currentBtcPrice, btcUnit).map(escapeCsv).join(","),
    ),
  ];
  const result = await dialog.showSaveDialog({
    defaultPath: "bittrack-transactions.csv",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false as const, error: "Export cancelled" };
  }
  fs.writeFileSync(result.filePath, lines.join("\n"), "utf8");
  return { ok: true as const, path: result.filePath };
}

export async function exportXls(
  currencyInput: unknown = "USD",
  transactionIds?: number[],
  btcUnitInput?: unknown,
) {
  const { rows, currency, currentBtcPrice, btcUnit } = await rowsForExport(
    currencyInput,
    transactionIds,
    btcUnitInput,
  );
  const headers = exportHeaders(currency, btcUnit);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.columns = headers.map((header, index) => ({
    header,
    key: `col${index}`,
    width: 18,
  }));
  sheet.addRows(
    rows.map((row) => {
      const values = exportRowValues(row, currentBtcPrice, btcUnit);
      return {
        col0: values.date,
        col1: values.flow,
        col2: values.walletName,
        col3: values.btcAmount,
        col4: values.valueAtDate,
        col5: values.currentValue,
        col6: values.unrealizedGain,
      };
    }),
  );
  sheet.getColumn(4).numFmt = btcUnit === "sats" ? "#,##0" : "#,##0.00000000";
  for (const index of [5, 6]) {
    sheet.getColumn(index).numFmt = "#,##0.00";
  }
  const result = await dialog.showSaveDialog({
    defaultPath: "bittrack-transactions.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false as const, error: "Export cancelled" };
  }
  await workbook.xlsx.writeFile(result.filePath);
  return { ok: true as const, path: result.filePath };
}

export function setCustomValueAtDate(
  transactionId: number,
  currencyInput: unknown,
  valueInput: unknown,
) {
  const currency = parseCurrency(currencyInput);
  const db = getDatabase();
  const row = db
    .prepare("SELECT custom_value_at_date FROM transactions WHERE id = ?")
    .get(transactionId) as { custom_value_at_date: string | null } | undefined;

  if (!row) {
    return { ok: false as const, error: "Transaction not found" };
  }

  let nextValue: number | null = null;
  if (valueInput != null && valueInput !== "") {
    const parsed = Number(valueInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false as const, error: "Enter a valid amount" };
    }
    nextValue = Math.round(parsed); // already in cents from the renderer
  }

  const values = parseCustomValuesAtDate(row.custom_value_at_date);
  if (nextValue == null) {
    delete values[currency];
  } else {
    values[currency] = nextValue;
  }

  db.prepare("UPDATE transactions SET custom_value_at_date = ? WHERE id = ?").run(
    serializeCustomValuesAtDate(values),
    transactionId,
  );

  return { ok: true as const };
}

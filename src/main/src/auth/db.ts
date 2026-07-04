import Database from "better-sqlite3-multiple-ciphers";
import { getDbPath } from "./auth";

let db: Database.Database | null = null;

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  xpub TEXT NOT NULL UNIQUE,
  derivation_path TEXT NOT NULL DEFAULT 'm/84''/0''/0''',
  source TEXT NOT NULL CHECK(source IN ('ledger', 'trezor', 'manual')),
  last_used_index INTEGER NOT NULL DEFAULT -1,
  last_synced_height INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  txid TEXT NOT NULL,
  date TEXT NOT NULL,
  btc_amount REAL NOT NULL,
  block_height INTEGER NOT NULL DEFAULT 0,
  address TEXT NOT NULL,
  address_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(wallet_id, txid, address)
);

CREATE TABLE IF NOT EXISTS price_cache (
  date TEXT PRIMARY KEY,
  usd_price REAL NOT NULL,
  eur_price REAL,
  gbp_price REAL
);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_date ON transactions(wallet_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_txid ON transactions(txid);
`;

export function openDatabase(dbKeyHex: string) {
  if (db) {
    db.close();
  }
  db = new Database(getDbPath());
  db.pragma(`key = "x'${dbKeyHex}'"`);
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATIONS);
  runSchemaPatches(db);
  return db;
}

function runSchemaPatches(database: Database.Database) {
  const txColumns = database.prepare("PRAGMA table_info(transactions)").all() as Array<{
    name: string;
  }>;
  if (!txColumns.some((column) => column.name === "vout_index")) {
    database.exec("ALTER TABLE transactions ADD COLUMN vout_index INTEGER");
  }
  if (!txColumns.some((column) => column.name === "flow")) {
    database.exec(`
      ALTER TABLE transactions ADD COLUMN flow TEXT NOT NULL DEFAULT 'inflow'
        CHECK(flow IN ('inflow', 'outflow'))
    `);
    database.exec(`
      UPDATE transactions
      SET flow = 'outflow', btc_amount = abs(btc_amount)
      WHERE btc_amount < 0
    `);
  }
  if (!txColumns.some((column) => column.name === "input_outpoints")) {
    database.exec("ALTER TABLE transactions ADD COLUMN input_outpoints TEXT");
  }
  if (!txColumns.some((column) => column.name === "custom_value_at_date")) {
    database.exec("ALTER TABLE transactions ADD COLUMN custom_value_at_date TEXT");
  }

  const priceColumns = database.prepare("PRAGMA table_info(price_cache)").all() as Array<{
    name: string;
  }>;
  if (!priceColumns.some((column) => column.name === "eur_price")) {
    database.exec("ALTER TABLE price_cache ADD COLUMN eur_price REAL");
  }
  if (!priceColumns.some((column) => column.name === "gbp_price")) {
    database.exec("ALTER TABLE price_cache ADD COLUMN gbp_price REAL");
  }

  dedupeTransactionsByTxid(database);
  ensureWalletTxidUniqueIndex(database);
}

function dedupeTransactionsByTxid(database: Database.Database) {
  database.exec(`
    DELETE FROM transactions
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM transactions
      GROUP BY wallet_id, txid
    )
  `);
}

function ensureWalletTxidUniqueIndex(database: Database.Database) {
  const index = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get("idx_transactions_wallet_txid_unique") as { name: string } | undefined;

  if (index) return;

  database.exec(`
    CREATE UNIQUE INDEX idx_transactions_wallet_txid_unique
    ON transactions (wallet_id, txid)
  `);
}

export function getDatabase() {
  if (!db) {
    throw new Error("Database is not unlocked");
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

type DatabaseLockListener = () => void;

let databaseLockListener: DatabaseLockListener | null = null;

export function setDatabaseLockListener(listener: DatabaseLockListener | null) {
  databaseLockListener = listener;
}

export function lockDatabase() {
  closeDatabase();
  databaseLockListener?.();
}

export function isDatabaseOpen() {
  return db != null;
}

export interface WalletRecord {
  id: number;
  name: string;
  xpub: string;
  derivation_path: string;
  source: "ledger" | "trezor" | "manual";
  last_used_index: number;
  last_synced_height: number;
  created_at: string;
}

export function setSetting(key: string, value: string) {
  getDatabase()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

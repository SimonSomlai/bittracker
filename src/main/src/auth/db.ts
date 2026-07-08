import Database from "better-sqlite3-multiple-ciphers";
import { getDbPath } from "./auth";

let db: Database.Database | null = null;

const SCHEMA_SQL = `
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
  btc_amount INTEGER NOT NULL,
  block_height INTEGER NOT NULL DEFAULT 0,
  address TEXT NOT NULL,
  address_index INTEGER NOT NULL DEFAULT 0,
  vout_index INTEGER,
  flow TEXT NOT NULL DEFAULT 'inflow' CHECK(flow IN ('inflow', 'outflow')),
  input_outpoints TEXT,
  custom_value_at_date TEXT,
  UNIQUE(wallet_id, txid, address)
);

CREATE TABLE IF NOT EXISTS price_cache (
  date TEXT PRIMARY KEY,
  usd_price INTEGER NOT NULL,
  eur_price INTEGER,
  gbp_price INTEGER
);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_date ON transactions(wallet_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_txid ON transactions(txid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_wallet_txid_unique ON transactions(wallet_id, txid);
`;

export function openDatabase(dbKeyHex: string) {
  if (db) {
    db.close();
  }
  db = new Database(getDbPath());

  // Dev debugging
  // console.log(getDbPath(), `x'${dbKeyHex}'`);
  // db.pragma(`cipher='sqlcipher'`);
  // db.pragma(`legacy=4`);

  db.pragma(`key = "x'${dbKeyHex}'"`);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
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

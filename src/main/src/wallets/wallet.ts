import { getDatabase, type WalletRecord } from "../auth/db";
import { getDerivationPath, validateXpub } from "../chain/xpub";

export function toWalletDto(row: WalletRecord) {
  return {
    id: row.id,
    name: row.name,
    xpub: row.xpub,
    derivationPath: row.derivation_path,
    source: row.source,
    lastUsedIndex: row.last_used_index,
    lastSyncedHeight: row.last_synced_height,
    createdAt: row.created_at,
  };
}

export function listWallets() {
  const rows = getDatabase()
    .prepare("SELECT * FROM wallets ORDER BY created_at DESC")
    .all() as WalletRecord[];
  return rows.map(toWalletDto);
}

const DEFAULT_SOURCE_LABELS = {
  ledger: "Ledger",
  trezor: "Trezor",
  manual: "Xpub",
} as const;

function defaultWalletName(source: keyof typeof DEFAULT_SOURCE_LABELS) {
  const label = DEFAULT_SOURCE_LABELS[source];
  const row = getDatabase()
    .prepare("SELECT COUNT(*) AS count FROM wallets WHERE source = ?")
    .get(source) as { count: number };
  return `${label} ${row.count + 1}`;
}

export function renameWallet(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false as const, error: "Wallet name is required" };
  }

  const result = getDatabase().prepare("UPDATE wallets SET name = ? WHERE id = ?").run(trimmed, id);

  if (result.changes === 0) {
    return { ok: false as const, error: "Wallet not found" };
  }

  const wallet = getDatabase()
    .prepare("SELECT * FROM wallets WHERE id = ?")
    .get(id) as WalletRecord;

  return { ok: true as const, wallet: toWalletDto(wallet) };
}

export function addWallet(payload: {
  name?: string;
  xpub: string;
  source: "ledger" | "trezor" | "manual";
  derivationPath?: string;
}) {
  const validated = validateXpub(payload.xpub);
  if (!validated.ok) {
    return { ok: false as const, error: validated.error };
  }

  const name = payload.name?.trim() || defaultWalletName(payload.source);
  try {
    const result = getDatabase()
      .prepare(
        `
        INSERT INTO wallets (name, xpub, derivation_path, source)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(name, validated.xpub, payload.derivationPath ?? getDerivationPath(), payload.source);
    const wallet = getDatabase()
      .prepare("SELECT * FROM wallets WHERE id = ?")
      .get(result.lastInsertRowid) as WalletRecord;
    return {
      ok: true as const,
      wallet: toWalletDto(wallet),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add wallet";
    if (message.includes("UNIQUE")) {
      return { ok: false as const, error: "This xpub is already added" };
    }
    return { ok: false as const, error: message };
  }
}

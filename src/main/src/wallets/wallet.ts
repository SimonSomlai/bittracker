import { getDatabase, type WalletRecord } from "../auth/db";
import { getDerivationPath, validateXpub } from "../chain/xpub";
import { parseMultisigDescriptor } from "../chain/multisig";

export function toWalletDto(row: WalletRecord) {
  return {
    id: row.id,
    name: row.name,
    xpub: row.xpub,
    derivationPath: row.derivation_path,
    source: row.source,
    kind: row.kind,
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
  kind?: "xpub" | "descriptor";
  derivationPath?: string;
}) {
  const kind = payload.kind ?? "xpub";
  let validatedXpub = payload.xpub;
  
  if (kind === "xpub") {
    const validated = validateXpub(payload.xpub);
    if (!validated.ok) {
      return { ok: false as const, error: validated.error };
    }
    validatedXpub = validated.xpub;
  } else {
    const parsed = parseMultisigDescriptor(payload.xpub);
    if (!parsed.ok) {
      return { ok: false as const, error: parsed.error };
    }
    validatedXpub = parsed.canonical;
  }

  const name = payload.name?.trim() || defaultWalletName(payload.source);
  try {
    const result = getDatabase()
      .prepare(
        `
        INSERT INTO wallets (name, xpub, derivation_path, source, kind)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(name, validatedXpub, payload.derivationPath ?? getDerivationPath(), payload.source, kind);
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
      return { ok: false as const, error: "This wallet is already added" };
    }
    return { ok: false as const, error: message };
  }
}

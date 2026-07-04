import type Database from "better-sqlite3-multiple-ciphers";
import type { EsploraTx } from "./esplora";

export function inputOutpoints(tx: EsploraTx) {
  const outpoints = new Set<string>();
  for (const input of tx.vin) {
    if (input.txid == null || input.vout == null) continue;
    outpoints.add(`${input.txid}:${input.vout}`);
  }
  return outpoints;
}

export function sharesInputOutpoints(left: EsploraTx, right: EsploraTx) {
  const rightOutpoints = inputOutpoints(right);
  for (const outpoint of inputOutpoints(left)) {
    if (rightOutpoints.has(outpoint)) return true;
  }
  return false;
}

function sharesOutpointSets(left: Set<string>, right: Set<string>) {
  for (const outpoint of left) {
    if (right.has(outpoint)) return true;
  }
  return false;
}

function parseStoredOutpoints(value: string | null | undefined) {
  if (!value) return new Set<string>();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set<string>();
  }
}

export function serializeOutpoints(outpoints: Set<string>) {
  return JSON.stringify([...outpoints].sort());
}

export function pickRbfWinner(
  left: { txid: string; height: number },
  right: { txid: string; height: number },
) {
  if (left.height !== right.height) {
    return left.height > right.height ? left.txid : right.txid;
  }
  return left.txid > right.txid ? left.txid : right.txid;
}

function cleanupWalletRbfDuplicates(db: Database.Database, walletId: number) {
  const rows = db
    .prepare(
      `SELECT txid, block_height, input_outpoints
       FROM transactions
       WHERE wallet_id = ? AND input_outpoints IS NOT NULL`,
    )
    .all(walletId);

  const deleteTx = db.prepare(`DELETE FROM transactions WHERE wallet_id = ? AND txid = ?`);
  const losers = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const left = rows[index]!;
    if (losers.has(left.txid)) continue;

    const leftOutpoints = parseStoredOutpoints(left.input_outpoints);
    if (leftOutpoints.size === 0) continue;

    for (let peerIndex = index + 1; peerIndex < rows.length; peerIndex += 1) {
      const right = rows[peerIndex]!;
      if (losers.has(right.txid)) continue;

      const rightOutpoints = parseStoredOutpoints(right.input_outpoints);
      if (!sharesOutpointSets(leftOutpoints, rightOutpoints)) continue;

      const winner = pickRbfWinner(
        { txid: left.txid, height: left.block_height },
        { txid: right.txid, height: right.block_height },
      );
      losers.add(winner === left.txid ? right.txid : left.txid);
    }
  }

  for (const txid of losers) {
    deleteTx.run(walletId, txid);
  }

  return losers.size;
}

export function cleanupAllWalletRbfDuplicates(db: Database.Database) {
  const wallets = db.prepare("SELECT id FROM wallets ORDER BY id").all();
  let removed = 0;
  for (const wallet of wallets) {
    removed += cleanupWalletRbfDuplicates(db, wallet.id);
  }
  return removed;
}

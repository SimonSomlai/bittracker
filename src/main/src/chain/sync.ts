import { getDatabase, setSetting, type WalletRecord } from "../auth/db";
import type { BrowserWindow } from "electron";
import { EsploraClient, EsploraRateLimitError, fetchCachedTx, type EsploraTx } from "./esplora";
import { inputOutpoints, pickRbfWinner, serializeOutpoints, sharesInputOutpoints } from "./rbf";
import { deriveWalletAddress, GAP_LIMIT } from "./xpub";

export type SyncProgress = {
  current: number;
  total: number;
  phase: "scanning" | "processing";
};

let getSyncProgressWindow: () => BrowserWindow | null = () => null;

export function setSyncProgressWindow(getter: () => BrowserWindow | null) {
  getSyncProgressWindow = getter;
}

function emitSyncProgress(progress: SyncProgress) {
  const win = getSyncProgressWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("sync:progress", progress);
  }
}

function addressMatches(value: string | undefined, address: string) {
  return value?.toLowerCase() === address.toLowerCase();
}

function netAmountForAddress(tx: EsploraTx, address: string) {
  let sats = 0;
  let primaryVout: number | null = null;
  let largestReceive = 0;

  for (const [index, output] of tx.vout.entries()) {
    if (!addressMatches(output.scriptpubkey_address, address)) continue;
    sats += output.value;
    if (output.value > largestReceive) {
      largestReceive = output.value;
      primaryVout = index;
    }
  }

  for (const input of tx.vin) {
    if (addressMatches(input.prevout?.scriptpubkey_address, address)) {
      sats -= input.prevout!.value;
    }
  }

  return {
    btcAmount: sats / 100_000_000,
    voutIndex: sats > 0 ? primaryVout : null,
  };
}

interface WalletAddressRef {
  address: string;
  addressIndex: number;
}

interface TxMeta {
  txid: string;
  date: string;
  height: number;
}

interface WalletTxAggregate {
  txid: string;
  net: number;
  date: string;
  height: number;
  address: string;
  addressIndex: number;
  voutIndex: number | null;
}

function aggregateWalletTransaction(
  tx: EsploraTx,
  meta: TxMeta,
  walletAddresses: WalletAddressRef[],
): WalletTxAggregate | null {
  let net = 0;
  let bestInflow: (WalletAddressRef & { net: number; voutIndex: number | null }) | null = null;
  let bestOutflow: (WalletAddressRef & { net: number }) | null = null;

  for (const ref of walletAddresses) {
    const { btcAmount, voutIndex } = netAmountForAddress(tx, ref.address);
    if (btcAmount === 0) continue;

    net += btcAmount;

    if (btcAmount > 0 && (!bestInflow || btcAmount > bestInflow.net)) {
      bestInflow = { ...ref, net: btcAmount, voutIndex };
    }
    if (btcAmount < 0 && (!bestOutflow || Math.abs(btcAmount) > Math.abs(bestOutflow.net))) {
      bestOutflow = { ...ref, net: btcAmount };
    }
  }

  if (Math.abs(net) < 1e-10) return null;

  const primary = net >= 0 ? (bestInflow ?? bestOutflow) : (bestOutflow ?? bestInflow);

  if (!primary) return null;

  return {
    txid: meta.txid,
    net,
    date: meta.date,
    height: meta.height,
    address: primary.address,
    addressIndex: primary.addressIndex,
    voutIndex: net > 0 ? (bestInflow?.voutIndex ?? null) : null,
  };
}

async function resolveRbfConflicts(
  db: ReturnType<typeof getDatabase>,
  walletId: number,
  meta: TxMeta,
  tx: EsploraTx,
  client: EsploraClient,
  cache: Map<string, EsploraTx>,
) {
  const deleteTx = db.prepare(`
    DELETE FROM transactions WHERE wallet_id = ? AND txid = ?
  `);
  const peers = db
    .prepare(`SELECT txid, block_height FROM transactions WHERE wallet_id = ?`)
    .all(walletId) as Array<{ txid: string; block_height: number }>;

  for (const peer of peers) {
    if (peer.txid === meta.txid) continue;

    const peerTx = await fetchCachedTx(client, cache, peer.txid);
    if (!sharesInputOutpoints(tx, peerTx)) continue;

    const winner = pickRbfWinner(
      { txid: meta.txid, height: meta.height },
      { txid: peer.txid, height: peer.block_height },
    );

    if (winner !== meta.txid) {
      return false;
    }

    deleteTx.run(walletId, peer.txid);
    console.log(`[sync] removed replaced-by-fee tx ${peer.txid} in favor of ${meta.txid}`);
  }

  return true;
}

function mergeAddressHistory(
  txMeta: Map<string, TxMeta>,
  history: EsploraTx[],
  highestHeight: number,
) {
  let nextHeight = highestHeight;

  for (const item of history) {
    const height = item.status.block_height;
    if (!item.status.confirmed || !height) continue;

    const date = item.status.block_time
      ? new Date(item.status.block_time * 1000).toISOString()
      : new Date().toISOString();

    const existing = txMeta.get(item.txid);
    if (!existing || height >= existing.height) {
      txMeta.set(item.txid, {
        txid: item.txid,
        date,
        height,
      });
    }
    nextHeight = Math.max(nextHeight, height);
  }

  return nextHeight;
}

async function discoverWalletActivity(
  wallet: WalletRecord,
  client: EsploraClient,
  onProgress?: (highestIndex: number, highestHeight: number) => void,
) {
  let index = 0;
  let consecutiveEmpty = 0;
  let highestIndex = wallet.last_used_index;
  let highestHeight = wallet.last_synced_height;
  const walletAddresses: WalletAddressRef[] = [];
  const txMeta = new Map<string, TxMeta>();

  while (consecutiveEmpty < GAP_LIMIT) {
    let indexHasActivity = false;

    for (const chain of [0, 1] as const) {
      const address = deriveWalletAddress(wallet.xpub, chain, index);
      walletAddresses.push({ address, addressIndex: index });

      const history = await client.getAllAddressTxs(address);
      if (history.length > 0) {
        indexHasActivity = true;
        highestIndex = Math.max(highestIndex, index);
      }

      highestHeight = mergeAddressHistory(txMeta, history, highestHeight);
    }

    if (indexHasActivity) {
      consecutiveEmpty = 0;
      onProgress?.(highestIndex, highestHeight);
    } else {
      consecutiveEmpty += 1;
    }

    index += 1;
  }

  return { walletAddresses, txMeta, highestIndex, highestHeight };
}

export async function syncWallets() {
  const db = getDatabase();
  const wallets = db.prepare("SELECT * FROM wallets ORDER BY id").all() as WalletRecord[];
  if (wallets.length === 0) {
    return { ok: true as const, newTransactions: 0 };
  }

  const client = new EsploraClient();

  const upsertTx = db.prepare(`
    INSERT INTO transactions
      (wallet_id, txid, date, btc_amount, flow, block_height, address, address_index, vout_index, input_outpoints)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet_id, txid) DO UPDATE SET
      date = excluded.date,
      btc_amount = excluded.btc_amount,
      flow = excluded.flow,
      block_height = excluded.block_height,
      address = excluded.address,
      address_index = excluded.address_index,
      vout_index = excluded.vout_index,
      input_outpoints = excluded.input_outpoints
  `);
  const existingTxidsForWallet = db.prepare(`
    SELECT txid FROM transactions WHERE wallet_id = ?
  `);
  const updateWallet = db.prepare(`
    UPDATE wallets
    SET last_used_index = ?, last_synced_height = ?
    WHERE id = ?
  `);

  let newTransactions = 0;
  const txCache = new Map<string, EsploraTx>();
  let processedCount = 0;
  let totalCount = 0;

  emitSyncProgress({ current: 0, total: 0, phase: "scanning" });

  for (const wallet of wallets) {
    const knownTxids = new Set(
      (existingTxidsForWallet.all(wallet.id) as Array<{ txid: string }>).map((row) => row.txid),
    );

    let highestIndex = wallet.last_used_index;
    let highestHeight = wallet.last_synced_height;
    let walletAddresses: WalletAddressRef[] = [];
    let txMeta = new Map<string, TxMeta>();

    emitSyncProgress({
      current: processedCount,
      total: totalCount,
      phase: "scanning",
    });

    try {
      const discovered = await discoverWalletActivity(wallet, client, (index, height) => {
        highestIndex = index;
        highestHeight = height;
        updateWallet.run(index, height, wallet.id);
      });
      walletAddresses = discovered.walletAddresses;
      txMeta = discovered.txMeta;
      highestIndex = discovered.highestIndex;
      highestHeight = discovered.highestHeight;
    } catch (error) {
      if (error instanceof EsploraRateLimitError) {
        setSetting("lastSyncAt", new Date().toISOString());
        return {
          ok: false as const,
          newTransactions,
          code: error.code,
          error: error.message,
        };
      }
      throw error;
    }

    let inflowCount = 0;
    let outflowCount = 0;
    let walletNewTransactions = 0;
    const txList = [...txMeta.values()];
    totalCount += txList.length;

    try {
      for (const meta of txList) {
        try {
          const tx = await fetchCachedTx(client, txCache, meta.txid);
          const shouldKeep = await resolveRbfConflicts(db, wallet.id, meta, tx, client, txCache);
          if (!shouldKeep) continue;

          const aggregate = aggregateWalletTransaction(tx, meta, walletAddresses);
          if (!aggregate) continue;

          const flow = aggregate.net > 0 ? "inflow" : "outflow";
          if (flow === "inflow") inflowCount += 1;
          else outflowCount += 1;

          if (!knownTxids.has(aggregate.txid)) {
            walletNewTransactions += 1;
            knownTxids.add(aggregate.txid);
          }

          upsertTx.run(
            wallet.id,
            aggregate.txid,
            aggregate.date,
            Math.abs(aggregate.net),
            flow,
            aggregate.height,
            aggregate.address,
            aggregate.addressIndex,
            aggregate.voutIndex,
            serializeOutpoints(inputOutpoints(tx)),
          );
        } finally {
          processedCount += 1;
          emitSyncProgress({
            current: processedCount,
            total: totalCount,
            phase: "processing",
          });
        }
      }
    } catch (error) {
      if (error instanceof EsploraRateLimitError) {
        newTransactions += walletNewTransactions;
        updateWallet.run(highestIndex, highestHeight, wallet.id);
        setSetting("lastSyncAt", new Date().toISOString());
        return {
          ok: false as const,
          newTransactions,
          code: error.code,
          error: error.message,
        };
      }
      throw error;
    }

    console.log(
      `[sync] wallet=${wallet.name} indexes=0-${highestIndex + GAP_LIMIT} txs=${inflowCount + outflowCount} inflows=${inflowCount} outflows=${outflowCount} new=${walletNewTransactions}`,
    );

    newTransactions += walletNewTransactions;

    updateWallet.run(highestIndex, highestHeight, wallet.id);
  }

  setSetting("lastSyncAt", new Date().toISOString());
  return { ok: true as const, newTransactions };
}

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { getBitcoinNetwork, getDerivationPath } from "./network";

const bip32 = BIP32Factory(ecc);
export const GAP_LIMIT = 20;

export { getDerivationPath };

function normalizeXpub(xpub: string) {
  return xpub.trim();
}

export function validateXpub(xpub: string) {
  try {
    const normalized = normalizeXpub(xpub);
    bip32.fromBase58(normalized, getBitcoinNetwork());
    return { ok: true as const, xpub: normalized };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Invalid xpub",
    };
  }
}

export function deriveWalletAddress(xpub: string, chain: 0 | 1, index: number) {
  const network = getBitcoinNetwork();
  const node = bip32.fromBase58(normalizeXpub(xpub), network);
  const child = node.derive(chain).derive(index);
  if (!child.publicKey) {
    throw new Error("Failed to derive public key");
  }
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: child.publicKey,
    network,
  });
  if (!address) {
    throw new Error("Failed to derive address");
  }
  return address;
}

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { getBitcoinNetwork, getDerivationPath } from "./network";
import bs58check from "bs58check";

const bip32 = BIP32Factory(ecc);
export const GAP_LIMIT = 20;

export { getDerivationPath, normalizeXpub };

const SLIP132_PUBLIC_VERSIONS = new Map<number, number>([
  [0x0488b21e, 0x0488b21e], // xpub
  [0x049d7cb2, 0x0488b21e], // ypub
  [0x0295b43f, 0x0488b21e], // Ypub
  [0x04b24746, 0x0488b21e], // zpub
  [0x02aa7ed3, 0x0488b21e], // Zpub
  [0x043587cf, 0x043587cf], // tpub
  [0x044a5262, 0x043587cf], // upub
  [0x024289ef, 0x043587cf], // Upub
  [0x045f1cf6, 0x043587cf], // vpub
  [0x02575483, 0x043587cf], // Vpub
]);

function normalizeXpub(xpub: string) {
  const trimmed = xpub.trim();

  try {
    const payload = Buffer.from(bs58check.decode(trimmed));
    const version = payload.readUInt32BE(0);
    const canonicalVersion = SLIP132_PUBLIC_VERSIONS.get(version);

    if (canonicalVersion == null || canonicalVersion === version) {
      return trimmed;
    }

    payload.writeUInt32BE(canonicalVersion, 0);
    return bs58check.encode(payload);
  } catch {
    return trimmed;
  }
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
    pubkey: Buffer.from(child.publicKey),
    network,
  });
  if (!address) {
    throw new Error("Failed to derive address");
  }
  return address;
}

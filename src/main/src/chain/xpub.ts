import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { getBitcoinNetwork, getDerivationPath } from "./network";
import bs58check from "bs58check";

const bip32 = BIP32Factory(ecc);
export const GAP_LIMIT = 20;

export { getDerivationPath };

function convertVariantXpubToStandard(xpub: string, network: bitcoin.Network) {
  const trimmed = xpub.trim();

  // Fast accept common standard prefixes
  const prefix = trimmed.slice(0, 4).toLowerCase();
  if (prefix === "xpub" || prefix === "tpub") return trimmed;

  try {
    const payload = Buffer.from(bs58check.decode(trimmed));
    const version = payload.readUInt32BE(0);

    // Mapping variant versions -> standard xpub/tpub version
    const mainnetMap: Record<number, number> = {
      0x049d7cb2: 0x0488b21e, // ypub -> xpub
      0x04b24746: 0x0488b21e, // zpub -> xpub
    };
    const testnetMap: Record<number, number> = {
      0x044a5262: 0x043587cf, // upub -> tpub
      0x045f1cf6: 0x043587cf, // vpub -> tpub
    };

    const targetVersion = network === bitcoin.networks.bitcoin ? 0x0488b21e : 0x043587cf;

    let newVersion: number | undefined;
    if (network === bitcoin.networks.bitcoin && mainnetMap[version])
      newVersion = mainnetMap[version];
    if (network === bitcoin.networks.testnet && testnetMap[version])
      newVersion = testnetMap[version];

    // If the version is already the target (or unrecognized), just return the trimmed input
    if (!newVersion) {
      // If this is a mainnet variant but already an xpub-like version, return as-is
      if (version === targetVersion) return trimmed;
      return trimmed;
    }

    payload.writeUInt32BE(newVersion, 0);
    return bs58check.encode(payload);
  } catch (err) {
    return trimmed;
  }
}

function normalizeXpub(xpub: string) {
  return convertVariantXpubToStandard(xpub, getBitcoinNetwork());
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

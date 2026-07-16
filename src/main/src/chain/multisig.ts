import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { getBitcoinNetwork } from "./network";
import { normalizeXpub } from "./xpub";

const bip32 = BIP32Factory(ecc);

export interface ParsedMultisigDescriptor {
  scriptType: "p2wsh" | "p2sh";
  threshold: number;
  sorted: boolean;
  keys: Array<{
    xpub: string;
    pathTemplate: string;
  }>;
}

export function parseMultisigDescriptor(input: string):
  | { ok: true; parsed: ParsedMultisigDescriptor; canonical: string }
  | { ok: false; error: string } {
  try {
    const trimmed = input.trim();
    // Simplified parsing for watch-only multisig (wsh/sh, multi/sortedmulti)
    const match = trimmed.match(/^(wsh|sh)\((sortedmulti|multi)\((\d+),(.+)\)\)$/i);
    if (!match) return { ok: false, error: "Unsupported descriptor format" };

    const [, wrapper, multiType, thresholdStr, keysStr] = match;
    const threshold = parseInt(thresholdStr);
    const sorted = multiType === "sortedmulti";
    const keysRaw = keysStr.split(",");
    
    const keys = keysRaw.map(k => {
      // Basic extraction: assumes xpub/path format
      const parts = k.split("/");
      const xpub = normalizeXpub(parts[0]);
      const pathTemplate = parts.slice(1).join("/");
      return { xpub, pathTemplate };
    });

    // Validate threshold
    if (threshold < 1 || threshold > keys.length) {
      return { ok: false, error: "Invalid threshold" };
    }

    const canonical = `${wrapper}(${multiType}(${threshold},${keys.map(k => `${k.xpub}/${k.pathTemplate}`).join(",")}))`;
    return { 
      ok: true, 
      parsed: { scriptType: wrapper === "wsh" ? "p2wsh" : "p2sh", threshold, sorted, keys }, 
      canonical 
    };
  } catch (e) {
    return { ok: false, error: "Parsing failed" };
  }
}

export function deriveMultisigAddress(
  parsed: ParsedMultisigDescriptor, chain: 0 | 1, index: number
): string {
  const network = getBitcoinNetwork();
  const pubkeys = parsed.keys.map(k => {
    const node = bip32.fromBase58(k.xpub, network);
    // Derivation logic: simple path handling
    const child = node.derive(chain).derive(index);
    return Buffer.from(child.publicKey);
  });

  if (parsed.sorted) {
    pubkeys.sort(Buffer.compare);
  }

  const redeem = bitcoin.payments.p2ms({ m: parsed.threshold, pubkeys, network });
  
  const payment = parsed.scriptType === "p2wsh" 
    ? bitcoin.payments.p2wsh({ redeem, network })
    : bitcoin.payments.p2sh({ redeem: bitcoin.payments.p2wsh({ redeem, network }), network });

  if (!payment.address) throw new Error("Failed to derive address");
  return payment.address;
}

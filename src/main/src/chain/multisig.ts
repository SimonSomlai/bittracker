import { Output } from "@bitcoinerlab/descriptors";
import { getBitcoinNetwork } from "./network";

const CHECKSUM_RE = /#[a-z0-9]{8}$/i;
const MULTIPATH_RE = /<\d+;\d+>/;

// Strip the optional checksum and rewrite a single receive/change wildcard
// (/0/* or /1/*) into a BIP389 multipath <0;1>/* so one stored descriptor
// derives both the receive and change branches.
function normalizeDescriptor(input: string): string {
  const stripped = input.trim().replace(CHECKSUM_RE, "");
  if (MULTIPATH_RE.test(stripped)) return stripped;
  return stripped.replace(/\/[01]\/\*/g, "/<0;1>/*");
}

function buildOutput(descriptor: string, chain: 0 | 1, index: number) {
  const network = getBitcoinNetwork();
  // For a multipath descriptor `change` selects the branch: 0 = receive, 1 = change.
  return MULTIPATH_RE.test(descriptor)
    ? new Output({ descriptor, index, change: chain, network })
    : new Output({ descriptor, index, network });
}

export function parseMultisigDescriptor(input: string):
  | { ok: true; descriptor: string }
  | { ok: false; error: string } {
  const descriptor = normalizeDescriptor(input);
  if (!descriptor) return { ok: false, error: "Descriptor is required" };
  try {
    buildOutput(descriptor, 0, 0).getAddress();
    return { ok: true, descriptor };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid descriptor";
    return { ok: false, error: message.replace(/^Error:\s*/i, "") };
  }
}

export function deriveMultisigAddress(descriptor: string, chain: 0 | 1, index: number): string {
  return buildOutput(descriptor, chain, index).getAddress();
}

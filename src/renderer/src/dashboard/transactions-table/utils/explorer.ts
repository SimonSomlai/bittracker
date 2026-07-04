import { getExplorerWebUrl } from "@/src/settings/utils/network-state";

export function txExplorerUrl(txid: string, voutIndex?: number | null) {
  const base = `${getExplorerWebUrl()}/tx/${txid}`;
  if (voutIndex == null) return base;
  return `${base}#output-${voutIndex}`;
}

export function addressExplorerUrl(address: string) {
  return `${getExplorerWebUrl()}/address/${address}`;
}

export function shortenTxid(txid: string) {
  if (txid.length <= 16) return txid;
  return `${txid.slice(0, 8)}…${txid.slice(-8)}`;
}

export function shortenAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-8)}`;
}

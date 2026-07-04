export type BitcoinNetworkId = "mainnet" | "testnet";

let runtimeNetwork: BitcoinNetworkId | null = null;

export function isDevEnvironment() {
  return Boolean(process.env.ELECTRON_RENDERER_URL);
}

export function setRuntimeNetwork(network: BitcoinNetworkId | null) {
  runtimeNetwork = network;
}

export function getNetworkId(): BitcoinNetworkId {
  if (runtimeNetwork && isDevEnvironment()) {
    return runtimeNetwork;
  }
  const explicit = process.env.BITTRACK_NETWORK?.trim().toLowerCase();
  if (explicit === "mainnet" || explicit === "testnet") {
    return explicit;
  }
  if (isDevEnvironment()) {
    return "testnet";
  }
  return "mainnet";
}

export function isTestnet() {
  return getNetworkId() === "testnet";
}

export const ESPLORA_API_URLS: Record<BitcoinNetworkId, readonly string[]> = {
  testnet: ["https://blockstream.info/testnet/api", "https://mempool.space/testnet/api"],
  mainnet: ["https://blockstream.info/api", "https://mempool.space/api"],
};

export function getExplorerWebUrl() {
  return isTestnet() ? "https://blockstream.info/testnet" : "https://blockstream.info";
}

export function getDerivationPath() {
  return isTestnet() ? "m/84'/1'/0'" : "m/84'/0'/0'";
}

export function getLedgerXpubVersion() {
  return isTestnet() ? 0x043587cf : 0x0488b21e;
}

export function getTrezorCoin() {
  return isTestnet() ? ("test" as const) : ("btc" as const);
}

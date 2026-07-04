import { loadPreferences } from "./preferences";
import { ESPLORA_API_URLS, getNetworkId } from "./network-env-core";

export type { BitcoinNetworkId } from "./network-env-core";
export {
  ESPLORA_API_URLS,
  getDerivationPath,
  getExplorerWebUrl,
  getLedgerXpubVersion,
  getNetworkId,
  getTrezorCoin,
  isDevEnvironment,
  isTestnet,
  setRuntimeNetwork,
} from "./network-env-core";

export function getEsploraApiUrls() {
  const defaults = [...ESPLORA_API_URLS[getNetworkId()]];
  const custom = loadPreferences().esploraBaseUrl;
  if (!custom) return defaults;
  return [custom, ...defaults.filter((url) => url !== custom)];
}

export function getEsploraApiUrl() {
  return getEsploraApiUrls()[0]!;
}

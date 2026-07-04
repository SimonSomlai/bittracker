import * as bitcoin from "bitcoinjs-lib";
import { getNetworkId } from "../settings/network-env";

export {
  getDerivationPath,
  getEsploraApiUrl,
  getEsploraApiUrls,
  getExplorerWebUrl,
  getLedgerXpubVersion,
  getNetworkId,
  getTrezorCoin,
  isTestnet,
  type BitcoinNetworkId,
} from "../settings/network-env";

export function getBitcoinNetwork() {
  return getNetworkId() === "testnet" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
}

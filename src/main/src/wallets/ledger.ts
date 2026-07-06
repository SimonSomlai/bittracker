import { createRequire } from "node:module";
import { getDerivationPath, getLedgerXpubVersion } from "../settings/network-env";

const require = createRequire(__filename);
const TransportNodeHid = require("@ledgerhq/hw-transport-node-hid").default;
const AppBtc = require("@ledgerhq/hw-app-btc").default;

const DERIVATION = `${getDerivationPath()}`;

async function getAccountXpub(app: InstanceType<typeof AppBtc>, path: string): Promise<string> {
  return app.getWalletXpub({ path, xpubVersion: getLedgerXpubVersion() });
}

export async function connectLedger() {
  let transport: Awaited<ReturnType<typeof TransportNodeHid.create>> | null = null;
  try {
    transport = await TransportNodeHid.create();
    const app = new AppBtc({ transport });
    const xpub = await getAccountXpub(app, DERIVATION.replace("m/", ""));
    return { ok: true as const, xpub };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Ledger connection failed",
    };
  } finally {
    await transport?.close();
  }
}

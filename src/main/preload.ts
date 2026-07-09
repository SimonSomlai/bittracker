import { contextBridge, ipcRenderer } from "electron";
import { getExplorerWebUrl, getNetworkId, isDevEnvironment } from "./src/settings/network-env-core";

type BitcoinNetworkId = "mainnet" | "testnet";
type FiatCurrency = "USD" | "EUR" | "GBP";
type SyncProgress = {
  current: number;
  total: number;
  phase: "scanning" | "processing";
};
type TrezorUiRequest = {
  requestId: string;
  type: string;
  payload?: unknown;
  responseType?: string;
  informational?: boolean;
};
type TrezorUiResponse = {
  requestId: string;
  type: string;
  payload?: unknown;
};

function onChannel<T extends unknown[]>(channel: string, callback: (...args: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const appMeta = {
  platform: process.platform as NodeJS.Platform,
  network: getNetworkId(),
  explorerWebUrl: getExplorerWebUrl(),
  isDev: isDevEnvironment(),
};

const networkApi = {
  getNetworkInfo: () =>
    ipcRenderer.invoke("network:get") as Promise<{
      network: BitcoinNetworkId;
      explorerWebUrl: string;
      isDev: boolean;
    }>,
  setDevNetwork: (network: BitcoinNetworkId) =>
    ipcRenderer.invoke("network:set", network) as Promise<{
      ok: boolean;
      network?: BitcoinNetworkId;
      explorerWebUrl?: string;
      error?: string;
    }>,
};

const authApi = {
  isInitialized: () => ipcRenderer.invoke("auth:is-initialized"),
  isUnlocked: () => ipcRenderer.invoke("auth:is-unlocked") as Promise<boolean>,
  onLocked: (callback: () => void) => onChannel("auth:locked", () => callback()),
  setupPassword: (password: string) => ipcRenderer.invoke("auth:setup", password),
  unlock: (password: string) => ipcRenderer.invoke("auth:unlock", password),
  lock: () => ipcRenderer.invoke("auth:lock"),
  resetApp: (password: string) => ipcRenderer.invoke("auth:reset", password),
  generatePassword: () => ipcRenderer.invoke("auth:generate-password") as Promise<string>,
};

const preferencesApi = {
  getPreferences: () =>
    ipcRenderer.invoke("preferences:get") as Promise<{
      esploraBaseUrl: string | null;
    }>,
  setPreferences: (partial: { esploraBaseUrl?: string | null }) =>
    ipcRenderer.invoke("preferences:set", partial) as Promise<{
      ok: boolean;
      preferences?: {
        esploraBaseUrl: string | null;
      };
      error?: string;
    }>,
};

const walletsApi = {
  connectLedger: () => ipcRenderer.invoke("wallet:connect-ledger"),
  connectTrezor: () => ipcRenderer.invoke("wallet:connect-trezor"),
  addWallet: (payload: {
    name?: string;
    xpub: string;
    source: "ledger" | "trezor" | "manual";
    derivationPath?: string;
  }) => ipcRenderer.invoke("wallet:add", payload),
  listWallets: () => ipcRenderer.invoke("wallet:list"),
  renameWallet: (walletId: number, name: string) =>
    ipcRenderer.invoke("wallet:rename", walletId, name),
};

const syncApi = {
  sync: () => ipcRenderer.invoke("sync:run"),
  onSyncProgress: (callback: (progress: SyncProgress) => void) =>
    onChannel("sync:progress", (progress: SyncProgress) => callback(progress)),
};

const dashboardApi = {
  getDashboard: (currency: FiatCurrency) => ipcRenderer.invoke("dashboard:get", currency),
};

const transactionsApi = {
  setCustomValueAtDate: (transactionId: number, currency: FiatCurrency, value: number | null) =>
    ipcRenderer.invoke("transaction:set-custom-value-at-date", transactionId, currency, value),
};

const exportApi = {
  exportCsv: (currency: FiatCurrency, transactionIds?: number[], btcUnit?: string) =>
    ipcRenderer.invoke("export:csv", currency, transactionIds, btcUnit),
  exportXls: (currency: FiatCurrency, transactionIds?: number[], btcUnit?: string) =>
    ipcRenderer.invoke("export:xls", currency, transactionIds, btcUnit),
};

const torApi = {
  getTorStatus: () =>
    ipcRenderer.invoke("tor:status") as Promise<{ running: boolean; exitIp: string | null }>,
  verifyTor: () =>
    ipcRenderer.invoke("tor:verify") as Promise<{ isTor: boolean; ip: string }>,
  onTorStatusChange: (callback: (running: boolean) => void) =>
    onChannel("tor:status-changed", (running: boolean) => callback(running)),
  onTorRotatingChange: (callback: (rotating: boolean) => void) =>
    onChannel("tor:rotating-changed", (rotating: boolean) => callback(rotating)),
  onTorIpChange: (callback: (ip: string) => void) =>
    onChannel("tor:ip-changed", (ip: string) => callback(ip)),
};

const trezorUiApi = {
  onTrezorUiRequest: (callback: (request: TrezorUiRequest) => void) =>
    onChannel("trezor:ui-request", (request: TrezorUiRequest) => callback(request)),
  sendTrezorUiResponse: (response: TrezorUiResponse) =>
    ipcRenderer.invoke("trezor:ui-response", response) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  cancelTrezorUi: (requestId?: string) => ipcRenderer.invoke("trezor:ui-cancel", requestId),
  onTrezorUiLog: (callback: (line: string) => void) =>
    onChannel("trezor:ui-log", (line: string) => callback(line)),
};

contextBridge.exposeInMainWorld("bittrack", {
  ...appMeta,
  ...networkApi,
  ...authApi,
  ...preferencesApi,
  ...walletsApi,
  ...syncApi,
  ...dashboardApi,
  ...transactionsApi,
  ...exportApi,
  ...torApi,
  ...trezorUiApi,
});

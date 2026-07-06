import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDatabaseOpen, lockDatabase, openDatabase, setDatabaseLockListener } from "./src/auth/db";
import {
  deriveDbKey,
  isInitialized,
  resetAppData,
  setupPassword,
  verifyPassword,
} from "./src/auth/auth";
import { EsploraRateLimitError } from "./src/chain/esplora";
import { syncWallets, setSyncProgressWindow } from "./src/chain/sync";
import {
  BitcoinNetworkId,
  getExplorerWebUrl,
  getNetworkId,
  isDevEnvironment,
} from "./src/settings/network-env";
import {
  applyDevNetworkFromPreferences,
  loadPreferences,
  saveDevNetwork,
  savePreferences,
  validateEsploraUrl,
} from "./src/settings/preferences";
import { getDashboardData } from "./src/dashboard/dashboard";
import { exportCsv, exportXls, setCustomValueAtDate } from "./src/transactions/transactions";
import { updateMarketDataDiff } from "./src/market/update";
import { addWallet, listWallets, renameWallet } from "./src/wallets/wallet";
import { registerTrezorUiIpc, setTrezorUiWindow } from "./src/wallets/trezor-ui-bridge";

const APP_PROTOCOL = "app";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

function getRendererRoot() {
  return path.join(__dirname, "..", "build", "client");
}

function registerRendererProtocol() {
  const rendererRoot = path.normalize(getRendererRoot());

  protocol.handle(APP_PROTOCOL, (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/" || pathname === "") {
      pathname = "/index.html";
    }

    const filePath = path.normalize(path.join(rendererRoot, pathname.replace(/^\/+/, "")));
    if (!filePath.startsWith(rendererRoot)) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function loadProductionRenderer(window: BrowserWindow) {
  void window.loadURL(`${APP_PROTOCOL}://./`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    title: "BitTracker",
    backgroundColor: "#0A0A0A",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 16, y: 18 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererDevUrl) {
    mainWindow.loadURL(rendererDevUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    loadProductionRenderer(mainWindow);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("close", () => {
    lockDatabase();
  });

  mainWindow.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      lockDatabase();
    }
  });
}

app.whenReady().then(() => {
  applyDevNetworkFromPreferences();
  if (isDevEnvironment()) {
    console.log(`[bittrack] dev network: ${getNetworkId()}`);
  }
  registerRendererProtocol();
  registerTrezorUiIpc();
  setDatabaseLockListener(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("auth:locked");
    }
  });
  setTrezorUiWindow(() => mainWindow);
  setSyncProgressWindow(() => mainWindow);
  void updateMarketDataDiff();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  lockDatabase();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("network:get", () => ({
  network: getNetworkId(),
  explorerWebUrl: getExplorerWebUrl(),
  isDev: isDevEnvironment(),
}));

ipcMain.handle("network:set", (_, network: string) => {
  if (!isDevEnvironment()) {
    return { ok: false as const, error: "Network switching is only available in development" };
  }
  try {
    saveDevNetwork(network as BitcoinNetworkId);
    return {
      ok: true as const,
      network: getNetworkId(),
      explorerWebUrl: getExplorerWebUrl(),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to switch network",
    };
  }
});

ipcMain.handle("auth:is-initialized", () => isInitialized());

ipcMain.handle("auth:is-unlocked", () => isDatabaseOpen());

ipcMain.handle("auth:setup", async (_, password: string) => {
  try {
    if (!password || password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }
    await setupPassword(password);
    const dbKey = await deriveDbKey(password);
    openDatabase(dbKey);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Setup failed",
    };
  }
});

ipcMain.handle("auth:unlock", async (_, password: string) => {
  try {
    const valid = await verifyPassword(password);
    if (!valid) {
      return { ok: false, error: "Incorrect password" };
    }
    const dbKey = await deriveDbKey(password);
    openDatabase(dbKey);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unlock failed",
    };
  }
});

ipcMain.handle("auth:lock", () => {
  lockDatabase();
  return { ok: true };
});

ipcMain.handle("preferences:get", () => loadPreferences());

ipcMain.handle(
  "preferences:set",
  (
    _,
    partial: {
      esploraBaseUrl?: string | null;
    },
  ) => {
    try {
      if (
        partial.esploraBaseUrl != null &&
        partial.esploraBaseUrl !== "" &&
        !validateEsploraUrl(partial.esploraBaseUrl)
      ) {
        return {
          ok: false as const,
          error: "Invalid Esplora URL. Use HTTPS or HTTP on localhost.",
        };
      }

      const esploraBaseUrl =
        partial.esploraBaseUrl === undefined
          ? undefined
          : partial.esploraBaseUrl
            ? validateEsploraUrl(partial.esploraBaseUrl)
            : null;

      const preferences = savePreferences({
        ...partial,
        ...(esploraBaseUrl !== undefined ? { esploraBaseUrl } : {}),
      });
      return { ok: true as const, preferences };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to save preferences",
      };
    }
  },
);

ipcMain.handle("auth:reset", async (_, password: string) => {
  try {
    if (!isInitialized()) {
      return { ok: false, error: "App is not initialized" };
    }
    if (!password) {
      return { ok: false, error: "Password is required" };
    }
    const valid = await verifyPassword(password);
    if (!valid) {
      return { ok: false, error: "Incorrect password" };
    }
    resetAppData();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Reset failed",
    };
  }
});

ipcMain.handle("wallet:list", () => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  return listWallets();
});

ipcMain.handle("wallet:add", (_, payload) => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  return addWallet(payload);
});

ipcMain.handle("wallet:rename", (_, walletId: number, name: string) => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  return renameWallet(walletId, name);
});

ipcMain.handle(
  "transaction:set-custom-value-at-date",
  (_, transactionId: number, currency: string, value: number | null) => {
    if (!isDatabaseOpen()) throw new Error("Database locked");
    return setCustomValueAtDate(transactionId, currency, value);
  },
);

ipcMain.handle("wallet:connect-ledger", async () => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  const { connectLedger } = await import("./src/wallets/ledger");
  return connectLedger();
});

ipcMain.handle("wallet:connect-trezor", async () => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  const { connectTrezor } = await import("./src/wallets/trezor");
  return connectTrezor();
});

ipcMain.handle("sync:run", async () => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  try {
    const syncResult = await syncWallets();
    // Always refresh market data diff after sync to get live prices
    void updateMarketDataDiff({ force: true });
    return syncResult;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sync failed",
      code: error instanceof EsploraRateLimitError ? error.code : undefined,
    };
  }
});

ipcMain.handle("dashboard:get", async (_, currency) => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  return getDashboardData(currency);
});

ipcMain.handle("export:csv", async (_, currency, transactionIds, btcUnit) => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  try {
    return await exportCsv(currency, transactionIds, btcUnit);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "CSV export failed",
    };
  }
});

ipcMain.handle("export:xls", async (_, currency, transactionIds, btcUnit) => {
  if (!isDatabaseOpen()) throw new Error("Database locked");
  try {
    return await exportXls(currency, transactionIds, btcUnit);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "XLS export failed",
    };
  }
});

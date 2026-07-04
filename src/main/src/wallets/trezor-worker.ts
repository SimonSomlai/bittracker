import { createRequire } from "node:module";

const require = createRequire(__filename);

type TrezorConnectAPI = {
  init: (settings: Record<string, unknown>) => Promise<void>;
  getPublicKey: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    payload: { error?: string; xpub?: string; serializable?: { xpub?: string } };
  }>;
  on: (type: string, handler: (event: { type: string; payload?: unknown }) => void) => void;
  uiResponse: (response: { type: string; payload?: unknown }) => void;
  cancel: (error?: Error) => void;
};

type WorkerRequest =
  | { type: "connect"; id: string; path: string; coin: string }
  | { type: "ui-response"; responseType: string; payload?: unknown }
  | { type: "cancel"; error?: string };

type WorkerResponse =
  | { type: "ready" }
  | { type: "log"; message: string }
  | { type: "ui-event"; event: { type: string; payload?: unknown } }
  | {
      type: "connect-result";
      id: string;
      ok: boolean;
      xpub?: string;
      error?: string;
    };

function send(message: WorkerResponse) {
  process.send?.(message);
}

function log(message: string) {
  send({ type: "log", message });
}

function loadTrezorConnect(): TrezorConnectAPI {
  const mod = require("@trezor/connect") as {
    default?: TrezorConnectAPI & { default?: TrezorConnectAPI };
  } & Partial<TrezorConnectAPI>;

  const connect =
    (typeof mod.default?.init === "function" ? mod.default : undefined) ??
    (typeof mod.default?.default?.init === "function" ? mod.default.default : undefined) ??
    (typeof mod.init === "function" ? (mod as TrezorConnectAPI) : undefined);

  if (!connect) {
    throw new Error("Failed to load @trezor/connect");
  }

  return connect;
}

let trezor: TrezorConnectAPI | null = null;
let initialized = false;

async function ensureReady() {
  if (!trezor) {
    trezor = loadTrezorConnect();
    trezor.on("UI_EVENT", (event) => {
      send({ type: "ui-event", event });
    });
  }

  if (!initialized) {
    await trezor.init({
      manifest: {
        email: "dev@bittrack.local",
        appUrl: "https://bittrack.local",
        appName: "BitTracker",
      },
      transports: ["BridgeTransport", "NodeUsbTransport"],
      debug: Boolean(process.env.ELECTRON_RENDERER_URL),
    });
    initialized = true;
  }

  return trezor;
}

async function handleConnect(id: string, path: string, coin: string) {
  try {
    log("worker connect started");
    const client = await ensureReady();
    log(`worker getPublicKey path=${path} coin=${coin}`);
    const result = await client.getPublicKey({
      path,
      coin,
      showOnTrezor: true,
    });

    if (!result.success) {
      const error = result.payload.error || "Trezor request failed";
      log(`worker getPublicKey failed error=${error}`);
      send({ type: "connect-result", id, ok: false, error });
      return;
    }

    const xpub = result.payload.xpub || result.payload.serializable?.xpub;
    if (!xpub) {
      send({ type: "connect-result", id, ok: false, error: "Trezor did not return an xpub" });
      return;
    }

    log(`worker getPublicKey succeeded xpub=${xpub.slice(0, 16)}…`);
    send({ type: "connect-result", id, ok: true, xpub });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trezor connection failed";
    log(`worker connect exception error=${message}`);
    send({ type: "connect-result", id, ok: false, error: message });
  }
}

process.on("message", (message: WorkerRequest) => {
  if (message.type === "connect") {
    void handleConnect(message.id, message.path, message.coin);
    return;
  }

  if (message.type === "ui-response") {
    trezor?.uiResponse({
      type: message.responseType,
      payload: message.payload,
    });
    return;
  }

  if (message.type === "cancel") {
    trezor?.cancel(message.error ? new Error(message.error) : undefined);
  }
});

send({ type: "ready" });

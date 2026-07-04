import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDerivationPath, getTrezorCoin } from "../settings/network-env";
import { attachTrezorUiBridge, trezorUiLog, type TrezorUiConnect } from "./trezor-ui-bridge";

type ConnectResultMessage = {
  type: "connect-result";
  id: string;
  ok: boolean;
  xpub?: string;
  error?: string;
};

type WorkerMessage =
  | { type: "ready" }
  | { type: "log"; message: string }
  | { type: "ui-event"; event: { type: string; payload?: unknown } }
  | ConnectResultMessage;

let worker: ChildProcess | null = null;
let workerReady = false;
let workerStarting: Promise<void> | null = null;
let uiEventHandler: ((event: { type: string; payload?: unknown }) => void) | null = null;
let bridgeAttached = false;
const pendingConnects = new Map<string, (result: ConnectResultMessage) => void>();

function workerPath() {
  return path.join(__dirname, "src", "wallets", "trezor-worker.cjs");
}

function disposeWorker() {
  worker?.removeAllListeners();
  worker?.kill();
  worker = null;
  workerReady = false;
  workerStarting = null;
}

function rejectPendingConnects(error: string) {
  for (const [id, resolve] of pendingConnects) {
    resolve({ type: "connect-result", id, ok: false, error });
  }
  pendingConnects.clear();
}

function attachWorkerUiBridge() {
  if (bridgeAttached) return;
  bridgeAttached = true;

  const adapter: TrezorUiConnect = {
    on(type, handler) {
      if (type === "UI_EVENT") {
        uiEventHandler = handler;
      }
    },
    uiResponse(response) {
      worker?.send({
        type: "ui-response",
        responseType: response.type,
        payload: response.payload,
      });
    },
    cancel(error) {
      worker?.send({
        type: "cancel",
        error: error?.message,
      });
    },
  };

  attachTrezorUiBridge(adapter);
}

function handleWorkerMessage(message: WorkerMessage) {
  switch (message.type) {
    case "ready":
      workerReady = true;
      break;
    case "log":
      trezorUiLog(message.message);
      break;
    case "ui-event":
      uiEventHandler?.(message.event);
      break;
    case "connect-result":
      pendingConnects.get(message.id)?.(message);
      pendingConnects.delete(message.id);
      break;
    default:
      break;
  }
}

async function ensureWorker() {
  if (worker && workerReady) return worker;
  if (workerStarting) {
    await workerStarting;
    return worker!;
  }

  workerStarting = new Promise<void>((resolve, reject) => {
    attachWorkerUiBridge();

    const child = fork(workerPath(), [], {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    worker = child;

    child.on("message", (message: WorkerMessage) => {
      handleWorkerMessage(message);
      if (message.type === "ready") {
        resolve();
      }
    });

    child.on("error", (error) => {
      trezorUiLog(`worker error: ${error.message}`);
      if (!workerReady) reject(error);
    });

    child.on("exit", (code, signal) => {
      trezorUiLog(`worker exited code=${code ?? "null"} signal=${signal ?? "null"}`);
      rejectPendingConnects(
        signal === "SIGBUS" || signal === "SIGSEGV"
          ? "Trezor USB access crashed. Install Trezor Suite (bridge) or reconnect the device and try again."
          : "Trezor worker stopped unexpectedly.",
      );
      disposeWorker();
    });

    setTimeout(() => {
      if (!workerReady) {
        reject(new Error("Trezor worker failed to start"));
        disposeWorker();
      }
    }, 15_000);
  });

  await workerStarting;
  return worker!;
}

function trezorErrorHint(error: string | undefined) {
  if (!error) return undefined;
  if (error === "Transport is missing") {
    return "Plug in your Trezor, unlock it, or install Trezor Suite for bridge access.";
  }
  if (error === "PIN cancelled" || error.includes("PinCancelled")) {
    return "PIN entry was cancelled on the device.";
  }
  return undefined;
}

export async function connectTrezor() {
  try {
    trezorUiLog("connectTrezor started");
    const child = await ensureWorker();
    const requestId = randomUUID();
    const derivationPath = getDerivationPath();
    const coin = getTrezorCoin();

    const result = await new Promise<ConnectResultMessage>((resolve, reject) => {
      pendingConnects.set(requestId, resolve);
      child.send({
        type: "connect",
        id: requestId,
        path: derivationPath,
        coin,
      });

      setTimeout(
        () => {
          if (!pendingConnects.has(requestId)) return;
          pendingConnects.delete(requestId);
          reject(new Error("Trezor connection timed out"));
        },
        5 * 60 * 1000,
      );
    });

    if (!result.ok) {
      const hint = trezorErrorHint(result.error);
      return {
        ok: false as const,
        error: hint ? `${result.error}. ${hint}` : (result.error ?? "Trezor request failed"),
      };
    }

    if (!result.xpub) {
      return { ok: false as const, error: "Trezor did not return an xpub" };
    }

    return { ok: true as const, xpub: result.xpub };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trezor connection failed";
    trezorUiLog(`connectTrezor exception error=${message}`);
    return {
      ok: false as const,
      error: message,
    };
  }
}

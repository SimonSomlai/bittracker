import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { isDevEnvironment } from "../settings/network-env";

export type TrezorUiRequestMessage = {
  requestId: string;
  type: string;
  payload?: unknown;
  responseType?: string;
  informational?: boolean;
};

export type TrezorUiResponseMessage = {
  requestId: string;
  type: string;
  payload?: unknown;
};

type TrezorUiConnect = {
  on: (type: string, handler: (event: { type: string; payload?: unknown }) => void) => void;
  uiResponse: (response: { type: string; payload?: unknown }) => void;
  cancel: (error?: Error) => void;
};

export type { TrezorUiConnect };

const INTERACTIVE_RESPONSES: Record<string, string> = {
  "ui-request_pin": "ui-receive_pin",
  "ui-request_passphrase": "ui-receive_passphrase",
  "ui-request_confirmation": "ui-receive_confirmation",
  "ui-request_permission": "ui-receive_permission",
  "ui-request_word": "ui-receive_word",
  "ui-request_thp_pairing": "ui-receive_thp_pairing_tag",
  "ui-invalid_passphrase": "ui-invalid_passphrase_action",
};

const UI_TIMEOUT_MS = 5 * 60 * 1000;

let getWindow: () => BrowserWindow | null = () => null;
let trezorRef: TrezorUiConnect | null = null;
let bridgeAttached = false;
let ipcRegistered = false;

const pending = new Map<
  string,
  {
    resolve: (value: TrezorUiResponseMessage) => void;
    reject: (error: Error) => void;
  }
>();
const fulfilledRequests = new Set<string>();

function shortId(requestId: string) {
  return requestId.slice(0, 8);
}

function summarizePayload(type: string, payload: unknown) {
  if (!isDevEnvironment()) {
    if (type.includes("pin") || type.includes("passphrase")) {
      return "[redacted]";
    }
  }

  if (type.includes("pin") && typeof payload === "string") {
    return isDevEnvironment() ? `length=${payload.length} positions=${payload}` : "[redacted]";
  }
  if (type.includes("passphrase") && payload && typeof payload === "object") {
    const value = payload as { value?: string; passphraseOnDevice?: boolean };
    if (value.passphraseOnDevice) return "passphraseOnDevice=true";
    return isDevEnvironment() ? `passphraseLength=${value.value?.length ?? 0}` : "[redacted]";
  }
  if (typeof payload === "boolean") return String(payload);
  if (payload == null) return "null";
  return typeof payload;
}

export function trezorUiLog(message: string) {
  const line = `[trezor-ui] ${message}`;
  if (isDevEnvironment()) {
    console.log(line);
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("trezor:ui-log", line);
    }
  }
}

export function setTrezorUiWindow(getter: () => BrowserWindow | null) {
  getWindow = getter;
}

export function registerTrezorUiIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("trezor:ui-response", (_, response: TrezorUiResponseMessage) => {
    trezorUiLog(
      `renderer response id=${shortId(response.requestId)} type=${response.type} ${summarizePayload(response.type, response.payload)}`,
    );

    const entry = pending.get(response.requestId);
    if (!entry) {
      trezorUiLog(
        `response rejected id=${shortId(response.requestId)} reason=no pending request (already handled, cancelled, or timed out)`,
      );
      return {
        ok: false as const,
        error: "No pending Trezor UI request for that response",
      };
    }

    pending.delete(response.requestId);
    entry.resolve(response);
    trezorUiLog(`response accepted id=${shortId(response.requestId)}`);
    return { ok: true as const };
  });

  ipcMain.handle("trezor:ui-cancel", (_, requestId?: string) => {
    if (requestId) {
      if (fulfilledRequests.has(requestId)) {
        trezorUiLog(`cancel ignored id=${shortId(requestId)} reason=already fulfilled`);
        return { ok: true as const };
      }
      trezorUiLog(`cancel requested id=${shortId(requestId)}`);
      rejectPending(requestId, new Error("Trezor request cancelled"));
      return { ok: true as const };
    }

    trezorUiLog("cancel all pending Trezor UI requests");
    rejectAllPending(new Error("Trezor request cancelled"));
    trezorRef?.cancel();
    return { ok: true as const };
  });
}

function rejectPending(requestId: string, error: Error) {
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);
  trezorUiLog(`request rejected id=${shortId(requestId)} error=${error.message}`);
  entry.reject(error);
}

function rejectAllPending(error: Error) {
  for (const [requestId, entry] of pending) {
    pending.delete(requestId);
    trezorUiLog(`request rejected id=${shortId(requestId)} error=${error.message}`);
    entry.reject(error);
  }
}

function sendToRenderer(message: TrezorUiRequestMessage) {
  const win = getWindow();
  if (!win || win.isDestroyed()) {
    throw new Error("No app window available for Trezor UI");
  }
  win.webContents.send("trezor:ui-request", message);
}

function waitForRendererResponse(
  message: TrezorUiRequestMessage,
): Promise<TrezorUiResponseMessage> {
  return new Promise((resolve, reject) => {
    pending.set(message.requestId, { resolve, reject });
    trezorUiLog(
      `waiting for renderer id=${shortId(message.requestId)} type=${message.type} responseType=${message.responseType ?? "none"}`,
    );
    sendToRenderer(message);

    setTimeout(() => {
      if (!pending.has(message.requestId)) return;
      rejectPending(message.requestId, new Error("Trezor UI request timed out"));
      trezorRef?.cancel(new Error("Trezor UI request timed out"));
    }, UI_TIMEOUT_MS);
  });
}

async function handleInteractiveEvent(
  trezor: TrezorUiConnect,
  event: { type: string; payload?: unknown },
  responseType: string,
) {
  const requestId = randomUUID();
  try {
    const response = await waitForRendererResponse({
      requestId,
      type: event.type,
      payload: event.payload,
      responseType,
    });
    fulfilledRequests.add(requestId);
    trezorUiLog(
      `forwarding to Trezor Connect id=${shortId(requestId)} type=${response.type} ${summarizePayload(response.type, response.payload)}`,
    );
    trezor.uiResponse({
      type: response.type,
      payload: response.payload,
    });
    trezorUiLog(`Trezor Connect uiResponse sent id=${shortId(requestId)}`);
    setTimeout(() => fulfilledRequests.delete(requestId), 5_000);
  } catch (error) {
    if (fulfilledRequests.has(requestId)) {
      trezorUiLog(`handler finished after fulfill id=${shortId(requestId)}`);
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown Trezor UI error";
    trezorUiLog(`interactive handler failed id=${shortId(requestId)} error=${message}`);
    trezor.cancel(error instanceof Error ? error : undefined);
  }
}

function handleUiEvent(trezor: TrezorUiConnect, event: { type: string; payload?: unknown }) {
  trezorUiLog(`UI event type=${event.type}${event.type.includes("pin") ? "" : ""}`);

  const responseType = INTERACTIVE_RESPONSES[event.type];
  if (responseType) {
    void handleInteractiveEvent(trezor, event, responseType);
    return;
  }

  try {
    sendToRenderer({
      requestId: randomUUID(),
      type: event.type,
      payload: event.payload,
      informational: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    trezorUiLog(`informational UI forward failed type=${event.type} error=${message}`);
  }
}

export function attachTrezorUiBridge(trezor: TrezorUiConnect) {
  if (bridgeAttached) return;
  bridgeAttached = true;
  trezorRef = trezor;
  trezorUiLog("bridge attached");
  trezor.on("UI_EVENT", handleUiEvent.bind(null, trezor));
}

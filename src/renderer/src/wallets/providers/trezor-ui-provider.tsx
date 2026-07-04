import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBittrackApi } from "@/utils/bittrack-client";

type TrezorUiRequest = {
  requestId: string;
  type: string;
  payload?: unknown;
  responseType?: string;
  informational?: boolean;
};

type TrezorPrompt = TrezorUiRequest & {
  pin: string;
  passphrase: string;
  invalidPin: boolean;
  invalidPassphrase: boolean;
  submitError: string | null;
  submitting: boolean;
};

const PIN_LAYOUT = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
] as const;

function emptyPrompt(request: TrezorUiRequest): TrezorPrompt {
  return {
    ...request,
    pin: "",
    passphrase: "",
    invalidPin: request.type === "ui-invalid_pin",
    invalidPassphrase: request.type === "ui-invalid_passphrase",
    submitError: null,
    submitting: false,
  };
}

function deviceLabel(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Trezor";
  const device = (payload as { device?: { label?: string } }).device;
  return device?.label?.trim() || "Trezor";
}

function supportsPassphraseOnDevice(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const features = (payload as { device?: { features?: { capabilities?: string[] } } }).device
    ?.features;
  return features?.capabilities?.includes("Capability_PassphraseEntry") ?? false;
}

function confirmationCopy(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      title: "Confirm on Trezor",
      description: "Approve this action to continue.",
    };
  }
  const view = (payload as { view?: string; label?: string }).view;
  const label = (payload as { label?: string }).label;
  switch (view) {
    case "export-xpub":
      return {
        title: "Export public key",
        description:
          label ??
          "BitTracker needs your wallet xpub to watch balances. Approve export on your Trezor.",
      };
    case "no-backup":
      return {
        title: "Wallet not backed up",
        description:
          "Your Trezor wallet has no backup. Continuing may risk loss of funds if the device fails.",
      };
    default:
      return {
        title: "Confirm action",
        description: label ?? "Approve this action to continue.",
      };
  }
}

function statusCopy(type: string, payload: unknown) {
  switch (type) {
    case "ui-button":
      return {
        title: "Confirm on device",
        description: "Check your Trezor screen and press the button to confirm.",
      };
    case "ui-request_passphrase_on_device":
      return {
        title: "Enter passphrase on device",
        description: "Type your passphrase using the buttons on your Trezor.",
      };
    case "ui-loading":
      return {
        title: "Trezor",
        description: "Waiting for your Trezor…",
      };
    case "ui-connect":
      return {
        title: "Trezor connected",
        description: `${deviceLabel(payload)} is ready.`,
      };
    case "ui-set_operation":
      return {
        title: "Trezor",
        description: typeof payload === "string" ? payload : "Working with your Trezor…",
      };
    default:
      return null;
  }
}

function appendPinPosition(current: string, position: number) {
  // Trezor expects matrix positions as ASCII "1"–"9", not char codes 1–9.
  return `${current}${String(position)}`;
}

export function TrezorUiProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<TrezorPrompt | null>(null);
  const [status, setStatus] = useState<{ title: string; description: string } | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const fulfilledRequestIdRef = useRef<string | null>(null);
  const promptRef = useRef<TrezorPrompt | null>(null);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    const onTrezorUiRequest = window.bittrack?.onTrezorUiRequest;
    if (!onTrezorUiRequest) return;

    const unsubRequest = onTrezorUiRequest((request) => {
      if (request.informational) {
        if (request.type === "ui-invalid_pin") {
          setPrompt((current) =>
            current?.type === "ui-request_pin"
              ? {
                  ...current,
                  pin: "",
                  invalidPin: true,
                  submitError: null,
                  submitting: false,
                }
              : current,
          );
          return;
        }
        if (request.type === "ui-close_window") {
          setStatus(null);
          return;
        }
        const copy = statusCopy(request.type, request.payload);
        if (copy) setStatus(copy);
        return;
      }

      setStatus(null);
      setPrompt((current) => {
        if (request.type === "ui-invalid_pin" && current?.type === "ui-request_pin") {
          return {
            ...current,
            pin: "",
            invalidPin: true,
            submitError: null,
            submitting: false,
          };
        }
        fulfilledRequestIdRef.current = null;
        activeRequestIdRef.current = request.requestId;
        return emptyPrompt(request);
      });
    });

    return () => {
      unsubRequest();
    };
  }, []);

  async function respond(next: { type: string; payload?: unknown }) {
    const current = promptRef.current;
    if (!current) return;

    setPrompt((value) => (value ? { ...value, submitting: true, submitError: null } : value));

    try {
      const result = await getBittrackApi().sendTrezorUiResponse?.({
        requestId: current.requestId,
        type: next.type,
        payload: next.payload,
      });

      if (!result?.ok) {
        const message = result?.error ?? "Trezor did not accept the response";
        setPrompt((value) =>
          value ? { ...value, submitting: false, submitError: message } : value,
        );
        return;
      }

      fulfilledRequestIdRef.current = current.requestId;
      activeRequestIdRef.current = null;
      setPrompt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Trezor UI error";
      setPrompt((value) => (value ? { ...value, submitting: false, submitError: message } : value));
    }
  }

  async function cancelPrompt() {
    const requestId = activeRequestIdRef.current;
    if (!requestId || fulfilledRequestIdRef.current === requestId) {
      activeRequestIdRef.current = null;
      setPrompt(null);
      return;
    }

    activeRequestIdRef.current = null;
    await getBittrackApi().cancelTrezorUi?.(requestId);
    setPrompt(null);
  }

  const open = prompt != null;
  const responseType = prompt?.responseType ?? "";
  const payload = prompt?.payload;

  return (
    <>
      {children}

      <Dialog
        open={status != null && !open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setStatus(null);
        }}
      >
        <DialogContent className="max-w-sm [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{status?.title}</DialogTitle>
            <DialogDescription>{status?.description}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={open}>
        <DialogContent
          className="max-w-sm [&>button]:hidden"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          {prompt?.type === "ui-request_pin" && (
            <>
              <DialogHeader>
                <DialogTitle>Trezor PIN</DialogTitle>
                <DialogDescription>Press in the order shown on your Trezor.</DialogDescription>
              </DialogHeader>
              {prompt.invalidPin && (
                <p className="text-sm text-destructive">Incorrect PIN. Try again.</p>
              )}
              {prompt.submitError && (
                <p className="text-sm text-destructive">{prompt.submitError}</p>
              )}
              <div className="flex justify-center gap-2 py-2">
                {Array.from({ length: Math.max(4, prompt.pin.length || 4) }).map((_, index) => (
                  <span
                    key={index}
                    className="flex h-3 w-3 items-center justify-center rounded-full border border-border bg-muted"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${index < prompt.pin.length ? "bg-foreground" : "bg-transparent"}`}
                    />
                  </span>
                ))}
              </div>
              <div className="mx-auto grid w-fit grid-cols-3 gap-2">
                {PIN_LAYOUT.flat().map((position) => (
                  <Button
                    key={position}
                    type="button"
                    variant="outline"
                    className="h-14 w-14 rounded-full p-0"
                    disabled={prompt.submitting}
                    aria-label="PIN pad button"
                    onClick={() =>
                      setPrompt((current) =>
                        current
                          ? {
                              ...current,
                              pin: appendPinPosition(current.pin, position),
                              submitError: null,
                            }
                          : current,
                      )
                    }
                  >
                    <span aria-hidden className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  </Button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={prompt.submitting}
                  onClick={() => void cancelPrompt()}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={prompt.pin.length === 0 || prompt.submitting}
                  onClick={() => void respond({ type: responseType, payload: prompt.pin })}
                >
                  {prompt.submitting ? "Confirming…" : "Confirm"}
                </Button>
              </div>
            </>
          )}

          {prompt?.type === "ui-request_passphrase" && (
            <>
              <DialogHeader>
                <DialogTitle>Passphrase</DialogTitle>
                <DialogDescription>
                  Enter the optional passphrase for {deviceLabel(payload)}.
                </DialogDescription>
              </DialogHeader>
              {prompt.invalidPassphrase && (
                <p className="text-sm text-destructive">Incorrect passphrase. Try again.</p>
              )}
              {prompt.submitError && (
                <p className="text-sm text-destructive">{prompt.submitError}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="trezor-passphrase">Passphrase</Label>
                <Input
                  id="trezor-passphrase"
                  type="password"
                  autoFocus
                  value={prompt.passphrase}
                  disabled={prompt.submitting}
                  onChange={(event) =>
                    setPrompt((current) =>
                      current
                        ? { ...current, passphrase: event.target.value, submitError: null }
                        : current,
                    )
                  }
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {supportsPassphraseOnDevice(payload) && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={prompt.submitting}
                    onClick={() =>
                      void respond({
                        type: responseType,
                        payload: { passphraseOnDevice: true, value: "" },
                      })
                    }
                  >
                    Enter on device
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={prompt.submitting}
                  onClick={() =>
                    void respond({
                      type: responseType,
                      payload: { value: prompt.passphrase, save: false },
                    })
                  }
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {prompt?.type === "ui-request_confirmation" && (
            <>
              <DialogHeader>
                <DialogTitle>{confirmationCopy(payload).title}</DialogTitle>
                <DialogDescription>{confirmationCopy(payload).description}</DialogDescription>
              </DialogHeader>
              {prompt.submitError && (
                <p className="text-sm text-destructive">{prompt.submitError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={prompt.submitting}
                  onClick={() => void respond({ type: responseType, payload: false })}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={prompt.submitting}
                  onClick={() => void respond({ type: responseType, payload: true })}
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {prompt?.type === "ui-request_permission" && (
            <>
              <DialogHeader>
                <DialogTitle>Allow Trezor access</DialogTitle>
                <DialogDescription>
                  BitTracker wants read-only access to {deviceLabel(payload)}.
                </DialogDescription>
              </DialogHeader>
              {prompt.submitError && (
                <p className="text-sm text-destructive">{prompt.submitError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={prompt.submitting}
                  onClick={() =>
                    void respond({
                      type: responseType,
                      payload: { granted: false, remember: false },
                    })
                  }
                >
                  Deny
                </Button>
                <Button
                  type="button"
                  disabled={prompt.submitting}
                  onClick={() =>
                    void respond({
                      type: responseType,
                      payload: { granted: true, remember: true },
                    })
                  }
                >
                  Allow
                </Button>
              </div>
            </>
          )}

          {prompt &&
            ![
              "ui-request_pin",
              "ui-request_passphrase",
              "ui-request_confirmation",
              "ui-request_permission",
            ].includes(prompt.type) && (
              <>
                <DialogHeader>
                  <DialogTitle>Trezor</DialogTitle>
                  <DialogDescription>
                    Complete the action on your Trezor to continue.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={() => void cancelPrompt()}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}

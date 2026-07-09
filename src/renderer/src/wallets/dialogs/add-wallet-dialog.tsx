import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import type { WalletSource } from "@/utils/bittrack-api";
import { cn } from "@/utils/cn";
import { getBittrackApi } from "@/utils/bittrack-client";

interface AddWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (walletName?: string) => void | Promise<void>;
}

type ConnectState = "idle" | "connecting" | "ready";
type Step = "pick" | "details";

type WalletMethod = {
  id: WalletSource;
  label: string;
  description: string;
  namePlaceholder: string;
  imageSrc: string;
};

const WALLET_METHODS: WalletMethod[] = [
  {
    id: "ledger",
    label: "Ledger",
    description: "Nano & Stax",
    namePlaceholder: "My Ledger",
    imageSrc: "/wallets/ledger.svg",
  },
  {
    id: "trezor",
    label: "Trezor",
    description: "Model One & T",
    namePlaceholder: "My Trezor",
    imageSrc: "/wallets/trezor.svg",
  },
  {
    id: "manual",
    label: "Xpub/Zpub/Ypub",
    description: "Paste a watch key",
    namePlaceholder: "My wallet",
    imageSrc: "/wallets/xpub.png",
  },
];

function methodFor(source: WalletSource) {
  return WALLET_METHODS.find((method) => method.id === source) ?? WALLET_METHODS[0];
}

function isValidXpub(value: string) {
  const trimmed = value.trim();
  return /^(xpub|ypub|zpub|tpub|vpub)/i.test(trimmed) && trimmed.length > 20;
}

export function AddWalletDialog({ open, onOpenChange, onAdded }: AddWalletDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick");
  const [name, setName] = useState("");
  const [xpub, setXpub] = useState("");
  const [source, setSource] = useState<WalletSource>("ledger");
  const [connectState, setConnectState] = useState<ConnectState>("idle");
  const [saving, setSaving] = useState(false);

  const selected = methodFor(source);
  const isConnected = connectState === "ready" && xpub.trim().length > 0;

  function reset() {
    setStep("pick");
    setName("");
    setXpub("");
    setSource("ledger");
    setConnectState("idle");
    setSaving(false);
  }

  function pickMethod(method: WalletSource) {
    setSource(method);
    setXpub("");
    setConnectState("idle");
    setStep("details");
  }

  function goBack() {
    setStep("pick");
    setXpub("");
    setConnectState("idle");
  }

  async function connectLedger() {
    setConnectState("connecting");
    try {
      const result = await getBittrackApi().connectLedger();
      if (!result.ok || !result.xpub) {
        toast({ title: "Ledger failed", description: result.error });
        setConnectState("idle");
        return;
      }
      setXpub(result.xpub);
      setSource("ledger");
      setConnectState("ready");
      toast({ title: "Ledger connected", description: "Save when ready. Name is optional." });
    } catch (error) {
      toast({
        title: "Ledger failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setConnectState("idle");
    }
  }

  async function connectTrezor() {
    setConnectState("connecting");
    try {
      const result = await getBittrackApi().connectTrezor();
      if (!result.ok || !result.xpub) {
        toast({ title: "Trezor failed", description: result.error });
        setConnectState("idle");
        return;
      }
      setXpub(result.xpub);
      setSource("trezor");
      setConnectState("ready");
      toast({ title: "Trezor connected", description: "Save when ready. Name is optional." });
    } catch (error) {
      toast({
        title: "Trezor failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setConnectState("idle");
    }
  }

  async function saveWallet() {
    setSaving(true);
    try {
      const result = await getBittrackApi().addWallet({
        name: name.trim() || undefined,
        xpub,
        source,
      });
      if (!result.ok) {
        toast({ title: "Could not save wallet", description: result.error });
        return;
      }
      onOpenChange(false);
      reset();
      await onAdded(result.wallet?.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        {step === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add wallet</DialogTitle>
              <DialogDescription>
                Choose how you want to connect. Only watch-only keys are stored.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-3">
              {WALLET_METHODS.map(({ id, label, description, imageSrc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickMethod(id)}
                  className={cn(
                    "window-no-drag flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition-colors",
                    "hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <div className="flex h-28 w-full items-center justify-center rounded-lg bg-muted/40 p-2">
                    <img
                      src={imageSrc}
                      alt={label}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="window-no-drag -ml-2 h-8 w-8 shrink-0"
                  onClick={goBack}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <DialogTitle>Add {selected.label} wallet</DialogTitle>
                  <DialogDescription>
                    {source === "ledger"
                      ? "Connect your Ledger with a cable. Unlock your Ledger, open the Bitcoin app, and press 'Connect Ledger'."
                      : source === "trezor"
                        ? "Connect your Trezor with a cable and press 'Connect Trezor'."
                        : "Paste your extended public key to track this wallet."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div
              className={cn(
                "relative flex items-center gap-3 rounded-xl border p-3 transition-colors",
                isConnected ? "border-green-500/60 bg-green-500/5" : "border-border bg-muted/20",
              )}
            >
              {isConnected ? (
                <div
                  className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white"
                  aria-label="Connected"
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </div>
              ) : null}
              <img
                src={selected.imageSrc}
                alt={selected.label}
                className="h-16 w-16 shrink-0 object-contain"
              />
              <div className="min-w-0 pr-8">
                <div className="font-medium">{selected.label}</div>
                <div className="text-sm text-muted-foreground">
                  {isConnected ? "Connected" : selected.description}
                </div>
                {isConnected ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {xpub.slice(0, 22)}…
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              {!isConnected && source === "ledger" ? (
                <Button onClick={connectLedger} disabled={connectState === "connecting"}>
                  {connectState === "connecting" ? "Waiting for device…" : "Connect Ledger"}
                </Button>
              ) : null}

              {!isConnected && source === "trezor" ? (
                <Button onClick={connectTrezor} disabled={connectState === "connecting"}>
                  {connectState === "connecting" ? "Waiting for device…" : "Connect Trezor"}
                </Button>
              ) : null}

              {!isConnected && source === "manual" ? (
                <div className="space-y-2">
                  <Label htmlFor="xpub">Extended public key</Label>
                  <textarea
                    id="xpub"
                    className="min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                    value={xpub}
                    onChange={(event) => {
                      const next = event.target.value;
                      setXpub(next);
                      setConnectState(isValidXpub(next) ? "ready" : "idle");
                    }}
                    placeholder="xpub, zpub or ypub"
                  />
                </div>
              ) : null}

              {isConnected ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="walletName">Wallet name (optional)</Label>
                    <Input
                      id="walletName"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !saving) void saveWallet();
                      }}
                      placeholder={selected.namePlaceholder}
                      autoFocus
                    />
                  </div>
                  <Button className="w-full" disabled={saving} onClick={saveWallet}>
                    {saving ? "Saving…" : "Save wallet"}
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

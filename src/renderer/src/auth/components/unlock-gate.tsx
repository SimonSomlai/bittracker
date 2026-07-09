import { Copy, Eye, EyeOff, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLogo } from "@/src/layout/components/app-logo";
import { AutoLockProvider } from "@/src/auth/providers/auto-lock-provider";
import { SettingsMenu } from "@/src/settings/components/settings-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { macTitlebarTopClass } from "@/src/layout/utils/electron-chrome";
import { cn } from "@/utils/cn";
import { getBittrackApi } from "@/utils/bittrack-client";

export function UnlockGate({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if (!window.bittrack) {
          setApiMissing(true);
          return;
        }
        const api = getBittrackApi();
        setInitialized(await api.isInitialized());
        if (await api.isUnlocked()) {
          setUnlocked(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const api = window.bittrack;
    if (!api?.onLocked) return;
    return api.onLocked(() => setUnlocked(false));
  }, []);

  async function handleGeneratePassword() {
    const api = getBittrackApi();
    const generated = await api.generatePassword();
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const api = getBittrackApi();
      if (!initialized) {
        if (password.length < 12) {
          toast({
            title: "Password too short",
            description: "Use at least 12 characters.",
          });
          return;
        }
        if (password !== confirmPassword) {
          toast({ title: "Passwords do not match" });
          return;
        }
        const result = await api.setupPassword(password);
        if (!result.ok) {
          toast({ title: "Setup failed", description: result.error });
          return;
        }
        const clipboardText = await navigator.clipboard.readText().catch(() => "");
        if (clipboardText !== password) {
          void navigator.clipboard.writeText(password);
          toast({
            title: "Password copied to clipboard!",
            description: "Store this in your password manager.",
          });
        }
      } else {
        const result = await api.unlock(password);
        if (!result.ok) {
          toast({ title: "Unlock failed", description: result.error });
          return;
        }
      }
      setUnlocked(true);
      setPassword("");
      setConfirmPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  if (apiMissing) {
    return (
      <div
        className={cn(
          "window-drag flex min-h-screen items-center justify-center bg-background px-4",
          macTitlebarTopClass(),
        )}
      >
        <Card className="window-no-drag w-full max-w-md border-border bg-card/90">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <AppLogo size="lg" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              BitTracker must run inside the desktop app. Start it with{" "}
              <code className="text-xs">pnpm dev</code> and use the Electron window, not the browser
              tab at localhost.
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          "window-drag flex min-h-screen items-center justify-center bg-background",
          macTitlebarTopClass(),
        )}
      >
        <div className="text-muted-foreground">Loading BitTracker…</div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div
        className={cn(
          "window-drag relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4",
          macTitlebarTopClass(),
        )}
      >
        <div className="window-no-drag absolute right-4 top-4">
          <SettingsMenu />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,147,26,0.12),transparent_45%)]" />
        <Card className="window-no-drag relative w-full max-w-md border-border bg-card/90 backdrop-blur">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <AppLogo size="lg" />
            </div>
            {!initialized && (
              <p className="mt-3 text-sm text-muted-foreground">
                Create a secure password. Use at least 12 characters.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {!initialized && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleGeneratePassword}
                    >
                      <Wand2 className="h-3 w-3" />
                      Generate
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoFocus
                  />
                  <div className="window-no-drag absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                    {password && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          void navigator.clipboard.writeText(password);
                          toast({
                            title: "Password copied to clipboard!",
                            description: "Store this in your password manager.",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-muted-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              {!initialized ? (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                    {confirmPassword && (
                      <button
                        type="button"
                        className="window-no-drag absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          void navigator.clipboard.writeText(confirmPassword);
                          toast({
                            title: "Password copied to clipboard!",
                            description: "Store this in your password manager.",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
              <Button className="w-full" disabled={submitting}>
                {submitting ? "Working…" : initialized ? "Unlock" : "Create vault"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AutoLockProvider onLock={() => setUnlocked(false)}>{children}</AutoLockProvider>;
}

import { RefreshCw, Wallet } from "lucide-react";
import { AppLogo } from "@/src/layout/components/app-logo";
import { useNetwork } from "@/src/settings/providers/network-provider";
import { SettingsMenu } from "@/src/settings/components/settings-menu";
import { Button } from "@/components/ui/button";
import { macTitlebarTopClass, pageShellClass } from "@/src/layout/utils/electron-chrome";
import type { SyncProgress } from "@/utils/bittrack-api";
import { cn } from "@/utils/cn";

interface AppHeaderProps {
  syncing: boolean;
  syncProgress: SyncProgress | null;
  hasWallets: boolean;
  onSync: () => void;
  onAddWallet: () => void;
}

function syncButtonLabel(syncing: boolean, syncProgress: SyncProgress | null) {
  if (!syncing) return "Sync";
  if (syncProgress && syncProgress.total > 0) {
    const pct = Math.round((syncProgress.current / syncProgress.total) * 100);
    return `${syncProgress.current}/${syncProgress.total} (${pct}%)`;
  }
  return "Scanning…";
}

export function AppHeader({
  syncing,
  syncProgress,
  hasWallets,
  onSync,
  onAddWallet,
}: AppHeaderProps) {
  const { network } = useNetwork();
  const isTestnet = network === "testnet";

  return (
    <header
      className={cn(
        "window-drag shrink-0 border-b border-border bg-background",
        macTitlebarTopClass(),
      )}
    >
      <div className={pageShellClass("flex items-center justify-between py-4")}>
        <div className="flex items-center gap-3">
          <AppLogo showTagline />
          {isTestnet ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              Testnet
            </span>
          ) : null}
        </div>
        <div className="window-no-drag flex items-center gap-2">
          {hasWallets || syncing ? (
            <Button variant="outline" onClick={onSync} disabled={syncing} className="min-w-[9.5rem]">
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncButtonLabel(syncing, syncProgress)}
            </Button>
          ) : null}
          <Button onClick={onAddWallet}>
            <Wallet className="h-4 w-4" />
            Add wallet
          </Button>
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddWalletDialog } from "@/src/wallets/dialogs/add-wallet-dialog";
import { AppHeader } from "@/src/layout/components/app-header";
import { AppFooter } from "@/src/layout/components/app-footer";
import { BtcChart } from "@/src/dashboard/components/btc-chart";
import { TransactionsTable } from "@/src/dashboard/transactions-table/components/transactions-table";
import { useCurrency } from "@/src/settings/providers/currency-provider";
import { useNetwork } from "@/src/settings/providers/network-provider";
import { useToast } from "@/components/ui/use-toast";
import {
  normalizeRawTransactionRows,
  type DashboardData,
  type SyncProgress,
} from "@/utils/bittrack-api";
import { pageShellClass } from "@/src/layout/utils/electron-chrome";
import { deriveDashboardView } from "@/src/dashboard/utils/selected-dashboard";
import { getBittrackApi } from "@/utils/bittrack-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const emptyRawDashboard: DashboardData = {
  priceSeries: [],
  transactions: [],
  currentBtcPrice: null,
  wallets: [],
  currency: "USD",
};

export function DashboardPage() {
  const { toast } = useToast();
  const { currency } = useCurrency();
  const { network } = useNetwork();
  const [rawDashboard, setRawDashboard] = useState<DashboardData>(emptyRawDashboard);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [syncInfoOpen, setSyncInfoOpen] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(
    () => new Set(),
  );

  const dashboardView = useMemo(
    () => deriveDashboardView(rawDashboard, selectedTransactionIds),
    [rawDashboard, selectedTransactionIds],
  );

  const refresh = useCallback(
    async (options?: { preserveContent?: boolean }) => {
      const preserveContent = options?.preserveContent ?? false;
      if (!preserveContent) {
        setLoading(true);
      }
      try {
        const data = await getBittrackApi().getDashboard(currency);
        setRawDashboard({
          ...data,
          transactions: normalizeRawTransactionRows(data.transactions),
        });
        setSelectedTransactionIds(new Set());
      } catch (error) {
        toast({
          title: "Failed to load dashboard",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        if (!preserveContent) {
          setLoading(false);
        }
      }
    },
    [currency, toast],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, network]);

  useEffect(() => {
    const api = getBittrackApi();
    if (!api.onSyncProgress) return;
    return api.onSyncProgress((progress) => setSyncProgress(progress));
  }, []);

  function syncErrorToast(error: string | undefined, code?: "rate_limited") {
    toast({
      title: code === "rate_limited" ? "Rate limited" : "Sync failed",
      description: error,
    });
  }

  async function handleSync() {
    setSyncing(true);
    setSyncProgress(null);
    try {
      const result = await getBittrackApi().sync();
      if (!result.ok) {
        if ((result.newTransactions ?? 0) > 0) {
          await refresh({ preserveContent: true });
          toast({
            title: result.code === "rate_limited" ? "Sync paused" : "Sync incomplete",
            description:
              result.code === "rate_limited"
                ? `${result.newTransactions} new transaction(s) synced. Sync again to fetch the rest.`
                : `${result.newTransactions} new transaction(s) synced. ${result.error ?? ""}`.trim(),
          });
          return;
        }
        syncErrorToast(result.error, result.code);
        return;
      }
      toast({
        title: "Sync complete",
        description: `${result.newTransactions ?? 0} new transaction(s)`,
      });
      await refresh({ preserveContent: true });
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  async function handleWalletAdded(walletName?: string) {
    setSyncing(true);
    setSyncProgress(null);
    setSyncInfoOpen(true);
    try {
      const result = await getBittrackApi().sync();
      if (!result.ok) {
        if ((result.newTransactions ?? 0) > 0) {
          await refresh({ preserveContent: true });
        }
        if (result.code === "rate_limited") {
          toast({
            title: walletName ? `${walletName} added` : "Wallet saved",
            description:
              (result.newTransactions ?? 0) > 0
                ? `${result.newTransactions} transaction(s) synced before rate limiting. Sync again to fetch the rest.`
                : "The explorer is rate-limiting requests. Check back later and sync again or use a VPN.",
          });
        } else {
          toast({
            title: "Wallet saved but sync failed",
            description: result.error,
          });
        }
      } else {
        toast({
          title: walletName ? `${walletName} added` : "Wallet added",
          description: `${result.newTransactions ?? 0} transaction(s) synced`,
        });
      }
      await refresh({ preserveContent: true });
    } finally {
      setSyncing(false);
      setSyncProgress(null);
      setSyncInfoOpen(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        syncing={syncing}
        syncProgress={syncProgress}
        hasWallets={rawDashboard.wallets.length > 0}
        onSync={handleSync}
        onAddWallet={() => setAddWalletOpen(true)}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={pageShellClass("flex flex-col gap-8 py-6")}>
          <BtcChart
            chart={dashboardView.chart}
            summary={dashboardView.summary}
            currency={dashboardView.summary.currency}
            loading={loading}
            selectionActive={selectedTransactionIds.size > 0}
          />
          <TransactionsTable
            transactions={dashboardView.allTransactions}
            connectedWalletNames={rawDashboard.wallets.map((wallet) => wallet.name)}
            currency={rawDashboard.currency}
            currentBtcPrice={rawDashboard.currentBtcPrice}
            loading={loading}
            selectedTransactionIds={selectedTransactionIds}
            onSelectedTransactionIdsChange={setSelectedTransactionIds}
            onWalletRenamed={() => refresh({ preserveContent: true })}
            onTransactionUpdated={() => refresh({ preserveContent: true })}
          />
        </div>
        <AppFooter />
      </main>
      <AddWalletDialog
        open={addWalletOpen}
        onOpenChange={setAddWalletOpen}
        onAdded={handleWalletAdded}
      />
      <Dialog open={syncInfoOpen} onOpenChange={setSyncInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Syncing wallet</DialogTitle>
            <DialogDescription>
              Scanning the blockchain for your transactions. This may take 2–3 minutes depending on
              your transaction history.
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setSyncInfoOpen(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

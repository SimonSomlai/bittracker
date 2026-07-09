import {
  Bitcoin,
  Check,
  Coins,
  Eye,
  EyeOff,
  Globe,
  Moon,
  Network,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useBtcUnit } from "@/src/settings/providers/btc-unit-provider";
import { useCurrency } from "@/src/settings/providers/currency-provider";
import { useIncognito } from "@/src/settings/providers/incognito-provider";
import { useNetwork } from "@/src/settings/providers/network-provider";
import { ResetAppDialog } from "@/src/settings/dialogs/reset-app-dialog";
import { SecuritySettingsDialog } from "@/src/settings/dialogs/security-settings-dialog";
import { useTheme } from "@/src/settings/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BTC_DISPLAY_UNIT_LABEL,
  BTC_DISPLAY_UNITS,
  type BtcDisplayUnit,
} from "@/src/settings/utils/btc-unit";
import { CURRENCY_SYMBOL, FIAT_CURRENCIES, type FiatCurrency } from "@/src/settings/utils/currency";
import type { BitcoinNetworkId } from "@/utils/bittrack-api";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/ui/use-toast";

const DEV_NETWORKS: BitcoinNetworkId[] = ["mainnet", "testnet"];

export function SettingsMenu() {
  const { toast } = useToast();
  const { incognito, setIncognito } = useIncognito();
  const { theme, toggleTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { btcUnit, setBtcUnit } = useBtcUnit();
  const { network, isDev, setNetwork } = useNetwork();
  const [resetOpen, setResetOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  async function handleNetworkChange(next: BitcoinNetworkId) {
    if (next === network) return;

    const result = await setNetwork(next);
    if (!result.ok) {
      toast({
        title: "Failed to switch network",
        description: result.error ?? "Could not update the development network setting.",
      });
      return;
    }

    toast({
      title: next === "testnet" ? "Switched to testnet" : "Switched to mainnet",
      description: "Sync again to fetch transactions for this network.",
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[11rem]">
          <DropdownMenuItem onSelect={() => setIncognito(!incognito)}>
            {incognito ? (
              <EyeOff className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            ) : (
              <Eye className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            )}
            Hide amounts
            {incognito ? <Check className="ml-2 h-4 w-4 shrink-0" /> : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleTheme}>
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            ) : (
              <Moon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            <Coins className="h-3.5 w-3.5 shrink-0" />
            Currency
          </DropdownMenuLabel>
          {FIAT_CURRENCIES.map((code) => (
            <CurrencyMenuItem
              key={code}
              code={code}
              selected={currency === code}
              onSelect={() => setCurrency(code)}
            />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            <Bitcoin className="h-3.5 w-3.5 shrink-0" />
            BTC display
          </DropdownMenuLabel>
          {BTC_DISPLAY_UNITS.map((unit) => (
            <BtcUnitMenuItem
              key={unit}
              unit={unit}
              selected={btcUnit === unit}
              onSelect={() => setBtcUnit(unit)}
            />
          ))}
          {isDev ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                <Network className="h-3.5 w-3.5 shrink-0" />
                Network
              </DropdownMenuLabel>
              {DEV_NETWORKS.map((id) => (
                <NetworkMenuItem
                  key={id}
                  network={id}
                  selected={network === id}
                  onSelect={() => void handleNetworkChange(id)}
                />
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTimeout(() => setSecurityOpen(true), 0)}>
            <Globe className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            Blockchain API
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setResetOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            Reset app
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetAppDialog open={resetOpen} onOpenChange={setResetOpen} />
      <SecuritySettingsDialog open={securityOpen} onOpenChange={setSecurityOpen} />
    </>
  );
}

function NetworkMenuItem({
  network,
  selected,
  onSelect,
}: {
  network: BitcoinNetworkId;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = network === "testnet" ? "Testnet" : "Mainnet";

  return (
    <DropdownMenuItem onSelect={onSelect} className={cn(selected && "bg-muted font-medium")}>
      {selected ? (
        <Check className="mr-2 h-4 w-4 shrink-0" />
      ) : (
        <Check className="mr-2 h-4 w-4 shrink-0 invisible" aria-hidden />
      )}
      {label}
    </DropdownMenuItem>
  );
}

function BtcUnitMenuItem({
  unit,
  selected,
  onSelect,
}: {
  unit: BtcDisplayUnit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className={cn(selected && "bg-muted font-medium")}>
      {selected ? (
        <Check className="mr-2 h-4 w-4 shrink-0" />
      ) : (
        <Check className="mr-2 h-4 w-4 shrink-0 invisible" aria-hidden />
      )}
      {BTC_DISPLAY_UNIT_LABEL[unit]}
    </DropdownMenuItem>
  );
}

function CurrencyMenuItem({
  code,
  selected,
  onSelect,
}: {
  code: FiatCurrency;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className={cn(selected && "bg-muted font-medium")}>
      {selected ? (
        <Check className="mr-2 h-4 w-4 shrink-0" />
      ) : (
        <Check className="mr-2 h-4 w-4 shrink-0 invisible" aria-hidden />
      )}
      <span>{code}</span>
      <span className="ml-1.5 text-muted-foreground">{CURRENCY_SYMBOL[code]}</span>
    </DropdownMenuItem>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useBtcUnit } from "@/src/settings/providers/btc-unit-provider";
import type { FiatCurrency } from "@/src/settings/utils/currency";
import { formatBtc, formatGainLoss, formatMoney, formatSats } from "@/utils/format";

const STORAGE_KEY = "bittrack-incognito";
const HIDDEN_FIAT = "•••••";
export const HIDDEN_BTC = "••••";

type IncognitoContextValue = {
  incognito: boolean;
  setIncognito: (value: boolean) => void;
};

const IncognitoContext = createContext<IncognitoContextValue | null>(null);

function readStoredIncognito() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function IncognitoProvider({ children }: { children: React.ReactNode }) {
  const [incognito, setIncognitoState] = useState(false);

  useEffect(() => {
    setIncognitoState(readStoredIncognito());
  }, []);

  const setIncognito = useCallback((value: boolean) => {
    setIncognitoState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {
      // ignore storage failures
    }
  }, []);

  const value = useMemo(() => ({ incognito, setIncognito }), [incognito, setIncognito]);

  return <IncognitoContext.Provider value={value}>{children}</IncognitoContext.Provider>;
}

export function useIncognito() {
  const context = useContext(IncognitoContext);
  if (!context) {
    throw new Error("useIncognito must be used within IncognitoProvider");
  }
  return context;
}

export function usePrivacyDisplay() {
  const { incognito } = useIncognito();
  const { btcUnit } = useBtcUnit();

  return useMemo(
    () => ({
      incognito,
      money: (value: number | null | undefined, currency: FiatCurrency = "USD") =>
        incognito ? HIDDEN_FIAT : formatMoney(value, currency),
      axisMoney: (value: number, currency: FiatCurrency) =>
        incognito ? HIDDEN_FIAT : formatMoney(value, currency),
      gainLoss: (
        gain: number | null | undefined,
        costBasis: number | null | undefined,
        currency: FiatCurrency = "USD",
      ) => {
        if (incognito) {
          return { text: HIDDEN_FIAT, className: "text-muted-foreground" };
        }
        return formatGainLoss(gain, costBasis, currency);
      },
      btc: (value: number | null | undefined, options?: { symbol?: boolean }) => {
        if (incognito) return HIDDEN_BTC;
        if (value == null || Number.isNaN(value)) return "—";
        if (btcUnit === "sats") {
          return `${formatSats(value)} sats`;
        }
        const formatted = formatBtc(value);
        return options?.symbol === false ? formatted : `₿ ${formatted}`;
      },
      btcAmountLabel: (value: number) => {
        if (incognito) return HIDDEN_BTC;
        if (btcUnit === "sats") {
          return `${formatSats(value)} sats`;
        }
        return `${formatBtc(value)} BTC`;
      },
      btcSigned: (value: number, isInflow: boolean) => {
        if (incognito) return HIDDEN_BTC;
        const sign = isInflow ? "+" : "−";
        if (btcUnit === "sats") {
          return `${sign}${formatSats(value)} sats`;
        }
        return `${sign}₿ ${formatBtc(value)}`;
      },
    }),
    [incognito, btcUnit],
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { parseCurrency, type FiatCurrency } from "@/src/settings/utils/currency";

const STORAGE_KEY = "bittrack-currency";

type CurrencyContextValue = {
  currency: FiatCurrency;
  setCurrency: (currency: FiatCurrency) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readStoredCurrency(): FiatCurrency {
  try {
    return parseCurrency(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "USD";
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<FiatCurrency>("USD");

  useEffect(() => {
    setCurrencyState(readStoredCurrency());
  }, []);

  const setCurrency = useCallback((next: FiatCurrency) => {
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within CurrencyProvider");
  }
  return context;
}

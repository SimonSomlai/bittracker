import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { parseBtcDisplayUnit, type BtcDisplayUnit } from "@/src/settings/utils/btc-unit";

const STORAGE_KEY = "bittrack-btc-unit";

type BtcUnitContextValue = {
  btcUnit: BtcDisplayUnit;
  setBtcUnit: (unit: BtcDisplayUnit) => void;
};

const BtcUnitContext = createContext<BtcUnitContextValue | null>(null);

function readStoredBtcUnit(): BtcDisplayUnit {
  try {
    return parseBtcDisplayUnit(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "sats";
  }
}

export function BtcUnitProvider({ children }: { children: React.ReactNode }) {
  const [btcUnit, setBtcUnitState] = useState<BtcDisplayUnit>("sats");

  useEffect(() => {
    setBtcUnitState(readStoredBtcUnit());
  }, []);

  const setBtcUnit = useCallback((next: BtcDisplayUnit) => {
    setBtcUnitState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const value = useMemo(() => ({ btcUnit, setBtcUnit }), [btcUnit, setBtcUnit]);

  return <BtcUnitContext.Provider value={value}>{children}</BtcUnitContext.Provider>;
}

export function useBtcUnit() {
  const context = useContext(BtcUnitContext);
  if (!context) {
    throw new Error("useBtcUnit must be used within BtcUnitProvider");
  }
  return context;
}

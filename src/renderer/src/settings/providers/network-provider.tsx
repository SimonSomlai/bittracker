import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { BitcoinNetworkId } from "@/utils/bittrack-api";
import { setExplorerWebUrl } from "@/src/settings/utils/network-state";
import { getBittrackApi } from "@/utils/bittrack-client";

type NetworkInfo = {
  network: BitcoinNetworkId;
  explorerWebUrl: string;
  isDev: boolean;
};

type SetNetworkResult = {
  ok: boolean;
  error?: string;
};

type NetworkContextValue = NetworkInfo & {
  setNetwork: (network: BitcoinNetworkId) => Promise<SetNetworkResult>;
  loading: boolean;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

function isRendererDev() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost";
}

function resolveIsDev(apiIsDev?: boolean) {
  return Boolean(apiIsDev ?? window.bittrack?.isDev ?? isRendererDev());
}

function applyNetworkInfo(info: Pick<NetworkInfo, "explorerWebUrl">) {
  setExplorerWebUrl(info.explorerWebUrl);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<NetworkInfo>(() => {
    if (typeof window === "undefined" || !window.bittrack) {
      return {
        network: "mainnet",
        explorerWebUrl: "https://blockstream.info",
        isDev: false,
      };
    }

    return {
      network: window.bittrack.network,
      explorerWebUrl: window.bittrack.explorerWebUrl,
      isDev: resolveIsDev(window.bittrack.isDev),
    };
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.bittrack) {
      setLoading(false);
      return;
    }

    const api = window.bittrack;
    if (!api.getNetworkInfo) {
      const fallback = {
        network: api.network,
        explorerWebUrl: api.explorerWebUrl,
        isDev: resolveIsDev(api.isDev),
      };
      setInfo(fallback);
      applyNetworkInfo(fallback);
      setLoading(false);
      return;
    }

    try {
      const next = await api.getNetworkInfo();
      const resolved = {
        ...next,
        isDev: resolveIsDev(next.isDev),
      };
      setInfo(resolved);
      applyNetworkInfo(resolved);
    } catch {
      const fallback = {
        network: api.network,
        explorerWebUrl: api.explorerWebUrl,
        isDev: resolveIsDev(api.isDev),
      };
      setInfo(fallback);
      applyNetworkInfo(fallback);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setNetwork = useCallback(async (network: BitcoinNetworkId) => {
    const api = getBittrackApi();
    if (!api.setDevNetwork) {
      return { ok: false, error: "Network switching is unavailable in this build." };
    }

    try {
      const result = await api.setDevNetwork(network);
      if (!result.ok || !result.network || !result.explorerWebUrl) {
        return {
          ok: false,
          error: result.error ?? "Could not update the development network setting.",
        };
      }

      const next = {
        network: result.network,
        explorerWebUrl: result.explorerWebUrl,
        isDev: true,
      };
      setInfo(next);
      applyNetworkInfo(next);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not switch network.",
      };
    }
  }, []);

  const value = useMemo(
    () => ({
      ...info,
      setNetwork,
      loading,
    }),
    [info, setNetwork, loading],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within NetworkProvider");
  }
  return context;
}

import fs from "node:fs";
import path from "node:path";
import { getUserDataDir } from "../shared/paths";
import {
  isDevEnvironment,
  setRuntimeNetwork,
  type BitcoinNetworkId,
} from "./network-env-core";

export interface AppPreferences {
  esploraBaseUrl: string | null;
  devNetwork?: BitcoinNetworkId | null;
}

const PREFS_FILE = "preferences.json";
const LEGACY_DEV_NETWORK_FILE = "dev-network.json";

const DEFAULTS: AppPreferences = {
  esploraBaseUrl: null,
  devNetwork: null,
};

let cached: AppPreferences | null = null;

function prefsPath() {
  return path.join(getUserDataDir(), PREFS_FILE);
}

function legacyDevNetworkPath() {
  return path.join(getUserDataDir(), LEGACY_DEV_NETWORK_FILE);
}

export function validateEsploraUrl(url: unknown): string | null {
  if (url == null || url === "") return null;
  if (typeof url !== "string") return null;

  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") return trimmed;
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeDevNetwork(value: unknown): BitcoinNetworkId | null {
  if (!isDevEnvironment()) return null;
  return value === "mainnet" || value === "testnet" ? value : null;
}

function normalizePreferences(raw: Partial<AppPreferences>): AppPreferences {
  const esploraBaseUrl =
    raw.esploraBaseUrl === undefined
      ? DEFAULTS.esploraBaseUrl
      : validateEsploraUrl(raw.esploraBaseUrl);

  const devNetwork =
    raw.devNetwork === undefined ? DEFAULTS.devNetwork : normalizeDevNetwork(raw.devNetwork);

  return { esploraBaseUrl, devNetwork };
}

function migrateLegacyDevNetworkFile() {
  const legacyPath = legacyDevNetworkPath();
  if (!fs.existsSync(legacyPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(legacyPath, "utf8")) as { network?: string };
    const devNetwork = normalizeDevNetwork(data.network);
    if (devNetwork) {
      const current = fs.existsSync(prefsPath())
        ? normalizePreferences(JSON.parse(fs.readFileSync(prefsPath(), "utf8")))
        : { ...DEFAULTS };
      fs.mkdirSync(getUserDataDir(), { recursive: true });
      fs.writeFileSync(
        prefsPath(),
        JSON.stringify(normalizePreferences({ ...current, devNetwork }), null, 2),
      );
      cached = null;
    }
    fs.unlinkSync(legacyPath);
  } catch {
    // Ignore corrupt legacy files.
  }
}

function readPreferencesFile(): AppPreferences {
  migrateLegacyDevNetworkFile();

  if (!fs.existsSync(prefsPath())) {
    return { ...DEFAULTS };
  }

  const raw = JSON.parse(fs.readFileSync(prefsPath(), "utf8")) as Partial<AppPreferences>;
  return normalizePreferences(raw);
}

export function loadPreferences(): AppPreferences {
  if (cached) return cached;
  try {
    cached = readPreferencesFile();
    return cached;
  } catch {
    cached = { ...DEFAULTS };
    return cached;
  }
}

export function savePreferences(partial: Partial<AppPreferences>): AppPreferences {
  const next = normalizePreferences({ ...loadPreferences(), ...partial });
  fs.mkdirSync(getUserDataDir(), { recursive: true });
  fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2));
  cached = next;
  return next;
}

export function clearPreferencesCache() {
  cached = null;
}

export function applyDevNetworkFromPreferences() {
  if (!isDevEnvironment()) return;

  const { devNetwork } = loadPreferences();
  if (devNetwork) {
    setRuntimeNetwork(devNetwork);
  }
}

export function saveDevNetwork(network: BitcoinNetworkId) {
  if (!isDevEnvironment()) {
    throw new Error("Network switching is only available in development");
  }

  savePreferences({ devNetwork: network });
  setRuntimeNetwork(network);
}

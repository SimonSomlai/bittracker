import type { FiatCurrency } from "@/src/settings/utils/currency";

export type BitcoinNetworkId = "mainnet" | "testnet";

export interface AppPreferences {
  esploraBaseUrl: string | null;
  devNetwork?: BitcoinNetworkId | null;
}

export type WalletSource = "ledger" | "trezor" | "manual";

interface Wallet {
  id: number;
  name: string;
  xpub: string;
  derivationPath: string;
  source: WalletSource;
  lastUsedIndex: number;
  lastSyncedHeight: number;
  createdAt: string;
}

export interface TransactionRow {
  id: number;
  walletId: number;
  walletName: string;
  txid: string;
  date: string;
  btcAmount: number;
  flow: ChartFlow;
  address: string;
  voutIndex: number | null;
  priceAtDate: number | null;
  valueAtDate: number | null;
  customValueAtDate: number | null;
  costBasis: number | null;
  cumulativeBtc: number;
  portfolioValue: number | null;
  unrealizedGain: number | null;
  blockHeight: number;
}

export interface ChartSeriesPoint {
  date: string;
  btcPrice: number | null;
  portfolioValue: number | null;
  cumulativeBtc?: number | null;
}

export type ChartFlow = "inflow" | "outflow";

export interface ChartMarker {
  date: string;
  btcPrice: number | null;
  portfolioValue: number | null;
  flow: ChartFlow;
  btcAmount: number;
  walletName: string;
}

export interface ChartData {
  series: ChartSeriesPoint[];
  markers: ChartMarker[];
}

const EMPTY_CHART: ChartData = { series: [], markers: [] };

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function coerceNullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = coerceNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseFlow(row: Record<string, unknown>): ChartFlow | null {
  const raw = readString(row.flow);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "inflow") return "inflow";
  if (lower === "outflow") return "outflow";
  return null;
}

function resolveFlow(row: Record<string, unknown>): ChartFlow {
  const explicit = parseFlow(row);
  if (explicit) return explicit;

  const signed = coerceNumber(row.btcAmount ?? row.btc_amount);
  return signed < 0 ? "outflow" : "inflow";
}

function signedBtcAmount(row: Record<string, unknown>, flow: ChartFlow): number {
  const magnitude = Math.abs(coerceNumber(row.btcAmount ?? row.btc_amount));
  if (magnitude === 0) return 0;
  return flow === "outflow" ? -magnitude : magnitude;
}

function normalizeTransactionRow(row: Record<string, unknown>): TransactionRow {
  const flow = resolveFlow(row);
  const btcAmount = signedBtcAmount(row, flow);

  const normalized: TransactionRow = {
    id: coerceNumber(row.id),
    walletId: coerceNumber(row.walletId ?? row.wallet_id),
    walletName: String(row.walletName ?? row.wallet_name ?? ""),
    txid: String(row.txid ?? ""),
    date: String(row.date ?? ""),
    btcAmount,
    flow,
    address: String(row.address ?? ""),
    voutIndex: coerceNullableNumber(row.voutIndex ?? row.vout_index),
    priceAtDate: coerceNullableNumber(row.priceAtDate ?? row.price_at_date),
    valueAtDate: coerceNullableNumber(row.valueAtDate ?? row.value_at_date),
    customValueAtDate:
      coerceNullableNumber(row.customValueAtDate ?? row.custom_value_at_date) ?? null,
    costBasis: coerceNullableNumber(row.costBasis ?? row.cost_basis),
    cumulativeBtc: coerceNumber(row.cumulativeBtc ?? row.cumulative_btc),
    portfolioValue: coerceNullableNumber(row.portfolioValue ?? row.portfolio_value),
    unrealizedGain: coerceNullableNumber(row.unrealizedGain ?? row.unrealized_gain),
    blockHeight: coerceNumber(row.blockHeight ?? row.block_height),
  };

  return normalized;
}

/** Coerce IPC dashboard transaction payloads, preserving flow direction. */
export function normalizeTransactionRows(raw: unknown): TransactionRow[] {
  if (!Array.isArray(raw)) return [];

  const normalized = raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    return [normalizeTransactionRow(entry as Record<string, unknown>)];
  });

  return dedupeTransactionRows(normalized);
}

function dedupeTransactionRows(rows: TransactionRow[]): TransactionRow[] {
  const byKey = new Map<string, TransactionRow>();

  for (const row of rows) {
    const key = `${row.walletId}:${row.txid}`;
    const existing = byKey.get(key);
    if (!existing || row.id > existing.id) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const dateCmp = left.date.localeCompare(right.date);
    if (dateCmp !== 0) return dateCmp;
    return left.id - right.id;
  });
}

/** Coerce IPC dashboard chart payloads into ChartData. */
export function normalizeChartData(raw: unknown): ChartData {
  if (!raw) return EMPTY_CHART;

  if (Array.isArray(raw)) {
    return {
      series: raw.filter(
        (point): point is ChartSeriesPoint =>
          point != null &&
          typeof point === "object" &&
          typeof (point as ChartSeriesPoint).date === "string",
      ),
      markers: [],
    };
  }

  if (typeof raw !== "object") return EMPTY_CHART;

  const data = raw as Partial<ChartData>;
  return {
    series: Array.isArray(data.series) ? data.series : [],
    markers: Array.isArray(data.markers) ? data.markers : [],
  };
}

export interface DashboardSummary {
  totalBtc: number;
  totalCostBasis: number;
  currentPortfolioValue: number;
  unrealizedGain: number;
  currentBtcPrice: number | null;
  currency: FiatCurrency;
}

export interface DashboardData {
  summary: DashboardSummary;
  transactions: TransactionRow[];
  chart: ChartData;
  wallets: Wallet[];
}

export type TrezorUiRequest = {
  requestId: string;
  type: string;
  payload?: unknown;
  responseType?: string;
  informational?: boolean;
};

export type TrezorUiResponse = {
  requestId: string;
  type: string;
  payload?: unknown;
};

export type SyncProgress = {
  current: number;
  total: number;
  phase: "scanning" | "processing";
};

export interface BittrackApi {
  platform: NodeJS.Platform;
  network: BitcoinNetworkId;
  explorerWebUrl: string;
  isDev?: boolean;
  getNetworkInfo?: () => Promise<{
    network: BitcoinNetworkId;
    explorerWebUrl: string;
    isDev: boolean;
  }>;
  setDevNetwork?: (network: BitcoinNetworkId) => Promise<{
    ok: boolean;
    network?: BitcoinNetworkId;
    explorerWebUrl?: string;
    error?: string;
  }>;
  isInitialized: () => Promise<boolean>;
  isUnlocked: () => Promise<boolean>;
  onLocked?: (callback: () => void) => () => void;
  setupPassword: (password: string) => Promise<{ ok: boolean; error?: string }>;
  unlock: (password: string) => Promise<{ ok: boolean; error?: string }>;
  lock: () => Promise<void>;
  getPreferences: () => Promise<AppPreferences>;
  setPreferences: (partial: Partial<AppPreferences>) => Promise<{
    ok: boolean;
    preferences?: AppPreferences;
    error?: string;
  }>;
  resetApp: (password: string) => Promise<{ ok: boolean; error?: string }>;
  connectLedger: () => Promise<{ ok: boolean; xpub?: string; error?: string }>;
  connectTrezor: () => Promise<{ ok: boolean; xpub?: string; error?: string }>;
  addWallet: (payload: {
    name?: string;
    xpub: string;
    source: WalletSource;
    derivationPath?: string;
  }) => Promise<{ ok: boolean; wallet?: Wallet; error?: string }>;
  listWallets: () => Promise<Wallet[]>;
  renameWallet: (
    walletId: number,
    name: string,
  ) => Promise<{ ok: boolean; wallet?: Wallet; error?: string }>;
  setCustomValueAtDate: (
    transactionId: number,
    currency: FiatCurrency,
    value: number | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  sync: () => Promise<{
    ok: boolean;
    newTransactions?: number;
    error?: string;
    code?: "rate_limited";
  }>;
  onSyncProgress?: (callback: (progress: SyncProgress) => void) => () => void;
  getDashboard: (currency: FiatCurrency) => Promise<DashboardData>;
  exportCsv: (
    currency: FiatCurrency,
    transactionIds?: number[],
    btcUnit?: string,
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  exportXls: (
    currency: FiatCurrency,
    transactionIds?: number[],
    btcUnit?: string,
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  getTorStatus?: () => Promise<{ running: boolean; exitIp: string | null }>;
  verifyTor?: () => Promise<{ isTor: boolean; ip: string }>;
  onTorStatusChange?: (callback: (running: boolean) => void) => () => void;
  onTrezorUiRequest?: (callback: (request: TrezorUiRequest) => void) => () => void;
  sendTrezorUiResponse?: (response: TrezorUiResponse) => Promise<{ ok: boolean; error?: string }>;
  cancelTrezorUi?: (requestId?: string) => Promise<{ ok: boolean }>;
  onTrezorUiLog?: (callback: (line: string) => void) => () => void;
}

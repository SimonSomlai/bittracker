import type {
  ChartData,
  ChartMarker,
  ChartSeriesPoint,
  DashboardData,
  DashboardSummary,
  PriceSeriesPoint,
  RawTransactionRow,
  TransactionRow,
} from "@/utils/bittrack-api";
import { transactionDateKey } from "@/src/dashboard/transactions-table/utils/date-keys";

function addDays(dateKey: string, days: number): string {
  const d = new Date(dateKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function eachDateKey(from: string, to: string): string[] {
  if (from > to) return [];
  const keys: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function recomputeTransactionRows(transactions: RawTransactionRow[]) {
  const sorted = [...transactions].sort((left, right) => {
    const dateCmp = left.date.localeCompare(right.date);
    if (dateCmp !== 0) return dateCmp;
    if (left.flow !== right.flow) {
      return left.flow === "inflow" ? -1 : 1;
    }
    return left.id - right.id;
  });

  let cumulativeBtc = 0;
  let totalCostBasis = 0;

  const rows = sorted.map((row) => {
    const basisValueAtDate = row.customValueAtDate ?? row.valueAtDate;

    if (row.flow === "inflow") {
      if (basisValueAtDate != null) totalCostBasis += basisValueAtDate;
    } else if (cumulativeBtc > 0) {
      const deduction = Math.round((row.btcAmount / cumulativeBtc) * totalCostBasis);
      totalCostBasis += deduction;
    }

    cumulativeBtc += row.btcAmount;
    const portfolioValue =
      row.priceAtDate != null
        ? Math.round((cumulativeBtc * row.priceAtDate) / 100_000_000)
        : null;

    return { ...row, cumulativeBtc, portfolioValue } satisfies TransactionRow;
  });

  return { rows, totalBtc: cumulativeBtc, totalCostBasis };
}

function buildChartFromRows(
  rows: TransactionRow[],
  priceSeries: PriceSeriesPoint[],
  currentBtcPrice: number | null,
  totalBtc: number,
): ChartData {
  const markers: ChartMarker[] = rows
    .filter((row) => row.btcAmount !== 0)
    .map((row) => ({
      date: transactionDateKey(row.date),
      btcPrice: row.priceAtDate,
      portfolioValue: row.portfolioValue,
      flow: row.flow,
      btcAmount: Math.abs(row.btcAmount),
      walletName: row.walletName,
    }));

  if (priceSeries.length === 0 || rows.length === 0) {
    return { series: [], markers };
  }

  // Build a Map from date to btcPrice for fast lookup
  const priceByDate = new Map(priceSeries.map((p) => [p.date, p.btcPrice]));

  const firstDate = rows[0]!.date.slice(0, 10);
  const today = todayDateKey();
  const dateKeys = eachDateKey(firstDate, today);

  let txIndex = 0;
  let lastCumulative = 0;
  let lastPrice: number | null = null;

  const series: ChartSeriesPoint[] = dateKeys.map((dateKey) => {
    while (txIndex < rows.length && rows[txIndex]!.date.slice(0, 10) <= dateKey) {
      lastCumulative = rows[txIndex]!.cumulativeBtc;
      txIndex += 1;
    }

    let btcPrice = priceByDate.get(dateKey) ?? null;
    // Forward-fill missing prices
    if (btcPrice != null) {
      lastPrice = btcPrice;
    } else if (lastPrice != null) {
      btcPrice = lastPrice;
    }

    return {
      date: dateKey,
      btcPrice,
      portfolioValue:
        btcPrice != null ? Math.round((lastCumulative * btcPrice) / 100_000_000) : null,
      cumulativeBtc: lastCumulative,
    };
  });

  // Update or add today's point with currentBtcPrice
  let todayPoint = series.find((point) => point.date === today);
  if (!todayPoint) {
    todayPoint = {
      date: today,
      btcPrice: currentBtcPrice,
      portfolioValue: null,
      cumulativeBtc: totalBtc,
    };
    series.push(todayPoint);
    series.sort((left, right) => left.date.localeCompare(right.date));
  }

  todayPoint.cumulativeBtc = totalBtc;
  if (currentBtcPrice != null) {
    todayPoint.btcPrice = currentBtcPrice;
    todayPoint.portfolioValue = Math.round((totalBtc * currentBtcPrice) / 100_000_000);
  } else if (todayPoint.btcPrice != null) {
    todayPoint.portfolioValue = Math.round((totalBtc * todayPoint.btcPrice) / 100_000_000);
  }

  return { series, markers };
}

export function deriveDashboardView(
  rawDashboard: DashboardData,
  selectedIds: ReadonlySet<number> | null | undefined,
): {
  allTransactions: TransactionRow[];
  summary: DashboardSummary;
  chart: ChartData;
} {
  const { rows: allRows, totalBtc: allTotalBtc, totalCostBasis: allTotalCostBasis } = recomputeTransactionRows(rawDashboard.transactions);

  const hasSelection = selectedIds != null && selectedIds.size > 0;

  let viewRows = allRows;
  let viewTotalBtc = allTotalBtc;
  let viewTotalCostBasis = allTotalCostBasis;

  if (hasSelection) {
    const selectedRaw = rawDashboard.transactions.filter((row) => selectedIds.has(row.id));
    const recomputed = recomputeTransactionRows(selectedRaw);
    viewRows = recomputed.rows;
    viewTotalBtc = recomputed.totalBtc;
    viewTotalCostBasis = recomputed.totalCostBasis;
  }

  const { currentBtcPrice, currency } = rawDashboard;
  const currentPortfolioValue =
    currentBtcPrice != null ? Math.round((viewTotalBtc * currentBtcPrice) / 100_000_000) : 0;
  const unrealizedGain = currentPortfolioValue - viewTotalCostBasis;

  const summary: DashboardSummary = {
    totalBtc: viewTotalBtc,
    totalCostBasis: viewTotalCostBasis,
    currentPortfolioValue,
    unrealizedGain,
    currentBtcPrice,
    currency,
  };

  const chart = buildChartFromRows(viewRows, rawDashboard.priceSeries, currentBtcPrice, viewTotalBtc);

  return { allTransactions: allRows, summary, chart };
}

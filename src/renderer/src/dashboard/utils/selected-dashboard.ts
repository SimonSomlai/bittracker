import type {
  ChartData,
  ChartMarker,
  ChartSeriesPoint,
  DashboardSummary,
  TransactionRow,
} from "@/utils/bittrack-api";
import type { FiatCurrency } from "@/src/settings/utils/currency";
import { transactionDateKey } from "@/src/dashboard/transactions-table/utils/date-keys";
import { roundFiatAmount } from "@/utils/format";

function resolveSelectedTransactions(
  transactions: TransactionRow[],
  selectedIds: ReadonlySet<number> | null | undefined,
) {
  if (!selectedIds || selectedIds.size === 0) return transactions;
  return transactions.filter((row) => selectedIds.has(row.id));
}

function recomputeTransactionRows(transactions: TransactionRow[]) {
  const sorted = dedupeTransactionsByTxid(transactions).sort((left, right) => {
    const dateCmp = left.date.localeCompare(right.date);
    if (dateCmp !== 0) return dateCmp;
    return left.id - right.id;
  });

  let cumulativeBtc = 0;
  let totalCostBasis = 0;

  const rows = sorted.map((row) => {
    const magnitude = Math.abs(row.btcAmount);
    const signedAmount = row.btcAmount;
    const priceAtDate = row.priceAtDate;
    const computedValueAtDate =
      priceAtDate != null ? roundFiatAmount(magnitude * priceAtDate) : null;
    const basisValueAtDate = row.customValueAtDate ?? computedValueAtDate;
    let costBasis: number | null = null;

    if (row.flow === "inflow") {
      costBasis = basisValueAtDate;
      if (costBasis != null) {
        totalCostBasis = roundFiatAmount(totalCostBasis + costBasis);
      }
    } else if (cumulativeBtc > 0) {
      const avgCost = totalCostBasis / cumulativeBtc;
      costBasis = roundFiatAmount(signedAmount * avgCost);
      totalCostBasis = roundFiatAmount(totalCostBasis + costBasis);
    }

    cumulativeBtc += signedAmount;
    const portfolioValue =
      priceAtDate != null ? roundFiatAmount(cumulativeBtc * priceAtDate) : null;
    const unrealizedGain =
      portfolioValue != null ? roundFiatAmount(portfolioValue - totalCostBasis) : null;

    return {
      ...row,
      valueAtDate: computedValueAtDate,
      customValueAtDate: row.customValueAtDate ?? null,
      costBasis,
      cumulativeBtc,
      portfolioValue,
      unrealizedGain,
    } satisfies TransactionRow;
  });

  return { rows, totalBtc: cumulativeBtc, totalCostBasis: roundFiatAmount(totalCostBasis) };
}

function dedupeTransactionsByTxid(transactions: TransactionRow[]) {
  const byKey = new Map<string, TransactionRow>();

  for (const row of transactions) {
    const key = `${row.walletId}:${row.txid}`;
    const existing = byKey.get(key);
    if (!existing || row.id > existing.id) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}

function buildSummaryForTransactions(
  transactions: TransactionRow[],
  currentBtcPrice: number | null,
  currency: FiatCurrency,
): DashboardSummary {
  const { totalBtc, totalCostBasis } = recomputeTransactionRows(transactions);
  const currentPortfolioValue =
    currentBtcPrice != null ? roundFiatAmount(totalBtc * currentBtcPrice) : 0;
  const unrealizedGain = roundFiatAmount(currentPortfolioValue - totalCostBasis);

  return {
    totalBtc,
    totalCostBasis,
    currentPortfolioValue,
    unrealizedGain,
    currentBtcPrice,
    currency,
  };
}

function buildChartForTransactions(
  transactions: TransactionRow[],
  baseSeries: ChartSeriesPoint[],
  currentBtcPrice: number | null,
): ChartData {
  const { rows, totalBtc } = recomputeTransactionRows(transactions);

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

  if (baseSeries.length === 0 || rows.length === 0) {
    return { series: [], markers };
  }

  let txIndex = 0;
  let lastCumulative = 0;
  const series = baseSeries.map((point) => {
    while (txIndex < rows.length && transactionDateKey(rows[txIndex]!.date) <= point.date) {
      lastCumulative = rows[txIndex]!.cumulativeBtc;
      txIndex += 1;
    }

    return {
      ...point,
      cumulativeBtc: lastCumulative,
      portfolioValue: point.btcPrice != null ? lastCumulative * point.btcPrice : null,
    };
  });

  const today = baseSeries.at(-1)?.date;
  if (today) {
    const todayPoint = series.find((point) => point.date === today);
    if (todayPoint) {
      todayPoint.cumulativeBtc = totalBtc;
      if (currentBtcPrice != null) {
        todayPoint.btcPrice = currentBtcPrice;
        todayPoint.portfolioValue = totalBtc * currentBtcPrice;
      } else if (todayPoint.btcPrice != null) {
        todayPoint.portfolioValue = totalBtc * todayPoint.btcPrice;
      }
    }
  }

  return { series, markers };
}

export function deriveDashboardView(
  dashboard: {
    transactions: TransactionRow[];
    chart: ChartData;
    summary: DashboardSummary;
  },
  selectedIds: ReadonlySet<number> | null | undefined,
) {
  const hasSelection = selectedIds != null && selectedIds.size > 0;
  const transactions = resolveSelectedTransactions(
    dashboard.transactions,
    hasSelection ? selectedIds : null,
  );

  return {
    ...dashboard,
    summary: buildSummaryForTransactions(
      transactions,
      dashboard.summary.currentBtcPrice,
      dashboard.summary.currency,
    ),
    chart: buildChartForTransactions(
      transactions,
      dashboard.chart.series,
      dashboard.summary.currentBtcPrice,
    ),
  };
}

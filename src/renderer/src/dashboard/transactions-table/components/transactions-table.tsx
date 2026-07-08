import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Info,
  MoreHorizontal,
  Pencil,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePrivacyDisplay } from "@/src/settings/providers/incognito-provider";
import { useBtcUnit } from "@/src/settings/providers/btc-unit-provider";
import { DateRangeFilter } from "./date-range-filter";
import { useToast } from "@/components/ui/use-toast";
import type { ChartFlow, TransactionRow } from "@/utils/bittrack-api";
import type { FiatCurrency } from "@/src/settings/utils/currency";
import { addressExplorerUrl, shortenAddress, shortenTxid, txExplorerUrl } from "../utils/explorer";
import { parseDateKey, transactionDateKey } from "../utils/date-keys";
import {
  effectiveValueAtDate,
  formatCustomValueDraft,
  parseCustomValueInput,
} from "../utils/custom-value-at-date";
import { cn } from "@/utils/cn";
import { getBittrackApi } from "@/utils/bittrack-client";
import {
  formatTransactionDate,
  transactionCurrentValue,
  transactionUnrealizedGain,
} from "../utils/transaction-display";

type FlowFilter = "all" | ChartFlow;

type SortColumn =
  "flow" | "date" | "wallet" | "btcAmount" | "valueAtDate" | "currentValue" | "unrealizedGain";

type SortState = {
  column: SortColumn;
  direction: "asc" | "desc";
};

interface TransactionsTableProps {
  transactions: TransactionRow[];
  connectedWalletNames?: string[];
  currency: FiatCurrency;
  currentBtcPrice: number | null;
  loading?: boolean;
  selectedTransactionIds: Set<number>;
  onSelectedTransactionIdsChange: (ids: Set<number>) => void;
  onWalletRenamed?: () => void | Promise<void>;
  onTransactionUpdated?: () => void | Promise<void>;
}

const DEFAULT_SORT: SortState = { column: "date", direction: "desc" };
const PAGE_SIZE = 100;
const TRANSACTIONS_TABLE_COLUMN_GRID = "grid-cols-[2.5rem_4fr_7.5fr_6fr_7fr_6.5fr_6.5fr_8fr_3fr]";
const TRANSACTIONS_TABLE_COMPACT_CLASS =
  "[&_tbody_td]:max-w-0 [&_tbody_td]:truncate [&_tbody_td]:!whitespace-nowrap [&_tbody_td]:!break-normal [&_tbody_td]:!py-1.5 [&_tbody_td:first-child]:max-w-none [&_tbody_td:first-child]:overflow-visible [&_tbody_td:last-child]:max-w-none [&_tbody_td:last-child]:overflow-visible [&_tbody_td:nth-child(6)]:max-w-none [&_tbody_td:nth-child(6)]:overflow-visible";

export function TransactionsTable({
  transactions,
  connectedWalletNames = [],
  currency,
  currentBtcPrice,
  loading = false,
  selectedTransactionIds,
  onSelectedTransactionIdsChange,
  onWalletRenamed,
  onTransactionUpdated,
}: TransactionsTableProps) {
  const { toast } = useToast();
  const { money, gainLoss, btcSigned } = usePrivacyDisplay();
  const { btcUnit } = useBtcUnit();
  const [search, setSearch] = useState("");
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(() => new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [page, setPage] = useState(1);

  const walletNames = useMemo(() => {
    const names = new Set(connectedWalletNames);
    for (const row of transactions) names.add(row.walletName);
    return [...names].sort();
  }, [connectedWalletNames, transactions]);

  const dateFilterDefaultMonth = useMemo(() => {
    if (transactions.length === 0) return undefined;
    const latestKey = transactions
      .map((row) => transactionDateKey(row.date))
      .sort()
      .at(-1);
    return latestKey ? parseDateKey(latestKey) : undefined;
  }, [transactions]);

  const transactionDateBounds = useMemo(() => {
    if (transactions.length === 0) return undefined;
    const keys = transactions.map((row) => transactionDateKey(row.date)).sort();
    return { from: keys[0]!, to: keys.at(-1)! };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return transactions.filter((row) => {
      const dateKey = transactionDateKey(row.date);
      if (dateFrom && dateKey < dateFrom) return false;
      if (dateTo && dateKey > dateTo) return false;
      if (flowFilter !== "all" && row.flow !== flowFilter) return false;
      if (selectedWallets.size > 0 && !selectedWallets.has(row.walletName)) return false;
      if (!query) return true;

      if (
        row.walletName.toLowerCase().includes(query) ||
        row.txid.toLowerCase().includes(query) ||
        row.address.toLowerCase().includes(query)
      ) {
        return true;
      }

      // numeric search: integer query → partial sat match; decimal query → exact BTC match
      const numericQuery = query.replace(/[,\s]/g, "");
      if (/^\d+$/.test(numericQuery)) {
        if (String(Math.abs(row.btcAmount)).includes(numericQuery)) return true;
      } else if (/^\d*\.\d+$/.test(numericQuery)) {
        const asSats = Math.round(parseFloat(numericQuery) * 1e8);
        if (Number.isFinite(asSats) && asSats === Math.abs(row.btcAmount)) return true;
      }

      return false;
    });
  }, [transactions, search, flowFilter, selectedWallets, dateFrom, dateTo]);

  const displayedTransactions = useMemo(
    () => sortTransactions(filteredTransactions, sort, currentBtcPrice),
    [filteredTransactions, sort, currentBtcPrice],
  );

  const pageCount = Math.max(1, Math.ceil(displayedTransactions.length / PAGE_SIZE));
  const showPagination = displayedTransactions.length > PAGE_SIZE;

  const paginatedTransactions = useMemo(() => {
    if (!showPagination) return displayedTransactions;
    const start = (page - 1) * PAGE_SIZE;
    return displayedTransactions.slice(start, start + PAGE_SIZE);
  }, [displayedTransactions, page, showPagination]);

  const selectedWalletKey = useMemo(
    () => [...selectedWallets].sort().join("\0"),
    [selectedWallets],
  );

  useEffect(() => {
    setPage(1);
  }, [search, flowFilter, selectedWalletKey, dateFrom, dateTo, sort, transactions.length]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pageIds = useMemo(
    () => paginatedTransactions.map((row) => row.id),
    [paginatedTransactions],
  );

  const displayedIds = useMemo(
    () => displayedTransactions.map((row) => row.id),
    [displayedTransactions],
  );

  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedTransactionIds.has(id));
  const allFilteredSelected =
    displayedIds.length > 0 && displayedIds.every((id) => selectedTransactionIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedTransactionIds.has(id)) && !allPageSelected;
  const pageSelectionActive =
    pageIds.length > 0 && pageIds.some((id) => selectedTransactionIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    flowFilter !== "all" ||
    selectedWallets.size > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0;

  const transactionCountLabel = useMemo(() => {
    const total = transactions.length;
    const displayed = filteredTransactions.length;
    const word = displayed === 1 ? "transaction" : "transactions";

    if (hasActiveFilters && displayed !== total) {
      return `${displayed} of ${total} ${word}`;
    }

    return `${total} ${word}`;
  }, [transactions.length, filteredTransactions.length, hasActiveFilters]);

  function toggleSort(column: SortColumn) {
    setSort((current) => {
      if (current.column !== column) {
        return { column, direction: column === "date" ? "desc" : "desc" };
      }
      return {
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  async function exportTransactions(format: "csv" | "xlsx") {
    const api = getBittrackApi();
    const transactionIds =
      selectedTransactionIds.size > 0 ? Array.from(selectedTransactionIds) : undefined;
    const result =
      format === "csv"
        ? await api.exportCsv(currency, transactionIds, btcUnit)
        : await api.exportXls(currency, transactionIds, btcUnit);

    toast({
      title: result.ok ? `${format === "csv" ? "CSV" : "Excel"} exported` : "Export failed",
      description: result.path ?? result.error,
    });
  }

  function toggleRowSelection(id: number) {
    const next = new Set(selectedTransactionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedTransactionIdsChange(next);
  }

  function toggleSelectAllPage() {
    const next = new Set(selectedTransactionIds);
    if (allPageSelected) {
      for (const id of pageIds) next.delete(id);
    } else {
      for (const id of pageIds) next.add(id);
    }
    onSelectedTransactionIdsChange(next);
  }

  function selectAllFiltered() {
    onSelectedTransactionIdsChange(new Set(displayedIds));
  }

  function clearSelection() {
    onSelectedTransactionIdsChange(new Set());
  }

  function toggleWallet(name: string) {
    setSelectedWallets((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setFlowFilter("all");
    setSelectedWallets(new Set());
    setDateFrom("");
    setDateTo("");
  }

  function handleWalletRenamed(previousName: string, nextName: string) {
    setSelectedWallets((current) => {
      if (!current.has(previousName)) return current;
      const next = new Set(current);
      next.delete(previousName);
      next.add(nextName);
      return next;
    });
    void onWalletRenamed?.();
  }

  function handleTransactionUpdated() {
    void onTransactionUpdated?.();
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Transactions</h2>
          {!loading ? (
            <p className="text-sm text-muted-foreground">{transactionCountLabel}</p>
          ) : null}
        </div>
        <ExportMenu
          disabled={loading}
          onExport={exportTransactions}
          selectionCount={selectedTransactionIds.size}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1 sm:max-w-[14rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, address, txid, sats…"
            className="h-8 rounded-full pl-8 text-xs"
            disabled={loading}
          />
        </div>

        <FlowFilterSelect value={flowFilter} onChange={setFlowFilter} disabled={loading} />

        <WalletMultiSelect
          walletNames={walletNames}
          selectedWallets={selectedWallets}
          onToggleWallet={toggleWallet}
          onClear={() => setSelectedWallets(new Set())}
          disabled={loading}
        />

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onApply={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          onClear={() => {
            setDateFrom("");
            setDateTo("");
          }}
          disabled={loading}
          defaultMonth={dateFilterDefaultMonth}
          bounds={transactionDateBounds}
        />

        {hasActiveFilters ? (
          <UnderlineFilter onClick={clearFilters} disabled={loading}>
            Clear
          </UnderlineFilter>
        ) : null}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <TransactionsTableSkeleton />
          ) : (
            <TooltipProvider delayDuration={200}>
              <Table
                className={cn("min-w-[880px] table-fixed", TRANSACTIONS_TABLE_COMPACT_CLASS)}
                overlay={
                  pageSelectionActive ? (
                    <BulkActionsBar
                      selectedCount={selectedTransactionIds.size}
                      totalCount={displayedTransactions.length}
                      allPageSelected={allPageSelected}
                      somePageSelected={somePageSelected}
                      allFilteredSelected={allFilteredSelected}
                      onSelectAll={selectAllFiltered}
                      onDeselectAll={clearSelection}
                    />
                  ) : null
                }
              >
                <TableHeader>
                  <TableRow className={cn(pageSelectionActive && "invisible")}>
                    <TableHead className="w-10">
                      <RowCheckbox
                        ref={selectAllRef}
                        checked={allPageSelected}
                        disabled={paginatedTransactions.length === 0}
                        aria-label="Select all transactions on this page"
                        onChange={toggleSelectAllPage}
                      />
                    </TableHead>
                    <SortableHead column="flow" sort={sort} onSort={toggleSort} className="w-16">
                      Type
                    </SortableHead>
                    <SortableHead
                      column="date"
                      sort={sort}
                      onSort={toggleSort}
                      className="w-[10rem]"
                    >
                      Date
                    </SortableHead>
                    <SortableHead
                      column="wallet"
                      sort={sort}
                      onSort={toggleSort}
                      className="w-[6rem]"
                    >
                      Wallet
                    </SortableHead>
                    <SortableHead
                      column="btcAmount"
                      sort={sort}
                      onSort={toggleSort}
                      className="w-[7rem] tabular-nums whitespace-nowrap"
                    >
                      {btcUnit === "sats" ? "Sats" : "BTC"}
                    </SortableHead>
                    <SortableHead
                      column="valueAtDate"
                      sort={sort}
                      onSort={toggleSort}
                      className="w-[6.5rem] tabular-nums whitespace-nowrap"
                      tooltip={`Cost basis for this transaction (BTC amount × BTC price in ${currency} at the transaction date). Used for gain/loss. Use the pencil icon to override with a custom amount; the clear icon resets to the market value.`}
                    >
                      Cost basis
                    </SortableHead>
                    <SortableHead
                      column="currentValue"
                      sort={sort}
                      onSort={toggleSort}
                      className="w-[6.5rem] tabular-nums whitespace-nowrap"
                      tooltip={`Current fiat value of the BTC in this transaction (${currency} amount × current BTC price).`}
                    >
                      {currency} value
                    </SortableHead>
                    <SortableHead
                      column="unrealizedGain"
                      sort={sort}
                      onSort={toggleSort}
                      className="w-[8rem] tabular-nums whitespace-nowrap"
                      tooltip={`Unrealized gain or loss in ${currency} for this transaction (${currency} value minus cost basis, including any override).`}
                    >
                      Unrealized gain/loss
                    </SortableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="!whitespace-normal py-10 text-center text-muted-foreground"
                      >
                        No transactions yet. Add a wallet and sync.
                      </TableCell>
                    </TableRow>
                  ) : displayedTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="!whitespace-normal py-10 text-center text-muted-foreground"
                      >
                        No transactions match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTransactions.map((row) => {
                      const isInflow = row.flow !== "outflow";
                      const currentValue = transactionCurrentValue(row.btcAmount, currentBtcPrice);
                      const basisValueAtDate = effectiveValueAtDate(row);
                      const unrealizedGain = transactionUnrealizedGain(
                        basisValueAtDate,
                        currentValue,
                      );
                      const rowGain = gainLoss(unrealizedGain, basisValueAtDate, currency);
                      const isSelected = selectedTransactionIds.has(row.id);

                      return (
                        <TableRow
                          key={row.id}
                          data-state={isSelected ? "selected" : undefined}
                          className={cn(isSelected && "bg-primary/5")}
                        >
                          <TableCell>
                            <RowCheckbox
                              checked={isSelected}
                              aria-label={`Select transaction on ${formatTransactionDate(row.date)}`}
                              onChange={() => toggleRowSelection(row.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex max-w-full items-center gap-1 text-xs font-medium",
                                isInflow ? "text-btc" : "text-red-500",
                              )}
                            >
                              {isInflow ? (
                                <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              ) : (
                                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              )}
                              {isInflow ? "In" : "Out"}
                            </span>
                          </TableCell>
                          <TableCell title={formatTransactionDate(row.date)}>
                            {formatTransactionDate(row.date)}
                          </TableCell>
                          <TableCell className="p-0">
                            <WalletNameCell
                              walletId={row.walletId}
                              walletName={row.walletName}
                              onRenamed={handleWalletRenamed}
                            />
                          </TableCell>
                          <TableCell
                            className={cn("tabular-nums", isInflow ? "text-btc" : "text-red-500")}
                            title={btcSigned(row.btcAmount, isInflow)}
                          >
                            {btcSigned(row.btcAmount, isInflow)}
                          </TableCell>
                          <TableCell className="p-0">
                            <ValueAtDateCell
                              transactionId={row.id}
                              currency={currency}
                              marketValue={row.valueAtDate}
                              customValue={row.customValueAtDate}
                              onSaved={handleTransactionUpdated}
                            />
                          </TableCell>
                          <TableCell
                            className="tabular-nums text-foreground"
                            title={currentValue != null ? money(currentValue, currency) : undefined}
                          >
                            {currentValue != null ? money(currentValue, currency) : "—"}
                          </TableCell>
                          <TableCell
                            className={cn("tabular-nums", rowGain.className)}
                            title={rowGain.text}
                          >
                            {rowGain.text}
                          </TableCell>
                          <TableCell>
                            <RowActionsMenu
                              txid={row.txid}
                              address={row.address}
                              voutIndex={row.voutIndex}
                              isReceive={isInflow}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
          {!loading && showPagination ? (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, displayedTransactions.length)} of{" "}
                {displayedTransactions.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="min-w-[5rem] text-center text-sm text-muted-foreground">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function sortTransactions(rows: TransactionRow[], sort: SortState, currentBtcPrice: number | null) {
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sort.column, currentBtcPrice);
    const bv = getSortValue(b, sort.column, currentBtcPrice);
    if (av === bv) return b.id - a.id;
    const cmp = av < bv ? -1 : 1;
    return sort.direction === "asc" ? cmp : -cmp;
  });
}

function getSortValue(
  row: TransactionRow,
  column: SortColumn,
  currentBtcPrice: number | null,
): number | string {
  switch (column) {
    case "flow":
      return row.flow === "inflow" ? 0 : 1;
    case "date":
      return new Date(row.date).getTime();
    case "wallet":
      return row.walletName.toLowerCase();
    case "btcAmount":
      return Math.abs(row.btcAmount);
    case "valueAtDate":
      return effectiveValueAtDate(row) ?? Number.NEGATIVE_INFINITY;
    case "currentValue":
      return currentBtcPrice != null
        ? Math.abs(row.btcAmount) * currentBtcPrice
        : Number.NEGATIVE_INFINITY;
    case "unrealizedGain": {
      const currentValue = transactionCurrentValue(row.btcAmount, currentBtcPrice);
      return (
        transactionUnrealizedGain(effectiveValueAtDate(row), currentValue) ??
        Number.NEGATIVE_INFINITY
      );
    }
  }
}

const FLOW_FILTER_OPTIONS: Array<{
  value: FlowFilter;
  label: string;
  icon?: ReactNode;
}> = [
  { value: "all", label: "All" },
  {
    value: "inflow",
    label: "Incoming",
    icon: <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-btc" />,
  },
  {
    value: "outflow",
    label: "Outgoing",
    icon: <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-red-500" />,
  },
];

function flowFilterLabel(value: FlowFilter) {
  if (value === "all") return "Type";
  return FLOW_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? "Type";
}

function walletFilterLabel(selected: Set<string>) {
  if (selected.size === 0) return "Wallet";
  if (selected.size === 1) return [...selected][0]!;
  return `Wallet (${selected.size})`;
}

function FlowFilterSelect({
  value,
  onChange,
  disabled,
}: {
  value: FlowFilter;
  onChange: (value: FlowFilter) => void;
  disabled?: boolean;
}) {
  const activeOption = FLOW_FILTER_OPTIONS.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterChip active={value !== "all"} disabled={disabled}>
          {value === "all" ? (
            <ArrowUpDown className="h-3 w-3 shrink-0 opacity-70" />
          ) : (
            activeOption?.icon
          )}
          {flowFilterLabel(value)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </FilterChip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        {FLOW_FILTER_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={cn(value === option.value && "bg-muted font-medium")}
          >
            {value === option.value ? (
              <Check className="mr-2 h-4 w-4 shrink-0" />
            ) : (
              <Check className="mr-2 h-4 w-4 shrink-0 invisible" aria-hidden />
            )}
            {option.icon ? <span className="mr-2 inline-flex">{option.icon}</span> : null}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WalletMultiSelect({
  walletNames,
  selectedWallets,
  onToggleWallet,
  onClear,
  disabled,
}: {
  walletNames: string[];
  selectedWallets: Set<string>;
  onToggleWallet: (name: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterChip active={selectedWallets.size > 0} disabled={disabled}>
          <Wallet className="h-3 w-3 shrink-0 opacity-70" />
          {walletFilterLabel(selectedWallets)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </FilterChip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        <DropdownMenuItem
          onSelect={onClear}
          className={cn(selectedWallets.size === 0 && "bg-muted font-medium")}
        >
          {selectedWallets.size === 0 ? (
            <Check className="mr-2 h-4 w-4 shrink-0" />
          ) : (
            <Check className="mr-2 h-4 w-4 shrink-0 invisible" aria-hidden />
          )}
          All wallets
        </DropdownMenuItem>
        {walletNames.map((name) => {
          const selected = selectedWallets.has(name);
          return (
            <DropdownMenuItem
              key={name}
              onSelect={(event) => {
                event.preventDefault();
                onToggleWallet(name);
              }}
              className={cn(selected && "bg-muted font-medium")}
            >
              {selected ? (
                <Check className="mr-2 h-4 w-4 shrink-0" />
              ) : (
                <Check className="mr-2 h-4 w-4 shrink-0 invisible" aria-hidden />
              )}
              {name}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FilterChip = forwardRef<
  HTMLButtonElement,
  {
    active?: boolean;
    disabled?: boolean;
    onClick?: () => void;
    children: ReactNode;
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function FilterChip({ active, disabled, onClick, children, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "window-no-drag inline-flex h-8 max-w-[12rem] items-center gap-1.5 truncate rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
FilterChip.displayName = "FilterChip";

function UnderlineFilter({
  children,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "window-no-drag h-8 px-1 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ValueAtDateCell({
  transactionId,
  currency,
  marketValue,
  customValue,
  onSaved,
}: {
  transactionId: number;
  currency: FiatCurrency;
  marketValue: number | null;
  customValue: number | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { money } = usePrivacyDisplay();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasOverride = customValue != null;
  const displayValue = customValue ?? marketValue;

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(formatCustomValueDraft(customValue ?? marketValue, currency));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };

  const saveValue = async (nextValue: number | null) => {
    if (saving) return;

    const normalized =
      nextValue != null && marketValue != null && nextValue === marketValue ? null : nextValue;

    if (normalized === customValue) {
      cancelEdit();
      return;
    }

    setSaving(true);
    try {
      const result = await getBittrackApi().setCustomValueAtDate(
        transactionId,
        currency,
        normalized,
      );
      if (!result.ok) {
        toast({
          title: "Could not save value",
          description: result.error ?? "Try again.",
        });
        cancelEdit();
        return;
      }
      onSaved();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const commitEdit = async () => {
    const parsed = parseCustomValueInput(draft, currency);
    if (!parsed.ok) {
      toast({
        title: "Invalid amount",
        description: parsed.error,
      });
      cancelEdit();
      return;
    }
    await saveValue(parsed.value);
  };

  const resetOverride = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!hasOverride) return;
    await saveValue(null);
  };

  const cellTitle = hasOverride
    ? `Overridden cost basis: ${money(customValue, currency)}. Market value: ${marketValue != null ? money(marketValue, currency) : "—"}.`
    : marketValue != null
      ? `${money(marketValue, currency)}. Use the pencil icon to override.`
      : undefined;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        disabled={saving}
        value={draft}
        placeholder="—"
        aria-label="Cost basis override"
        className="window-no-drag h-8 w-full min-w-[5.5rem] border-0 bg-muted/60 px-3 text-sm tabular-nums outline-none ring-1 ring-inset ring-border focus:ring-primary"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commitEdit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commitEdit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
        }}
      />
    );
  }

  return (
    <div className="flex h-8 min-w-0 items-center px-3" title={cellTitle}>
      <div className="inline-flex min-w-0 max-w-full items-center gap-0.5">
        <span
          className={cn(
            "truncate text-sm tabular-nums",
            hasOverride ? "font-medium text-foreground" : "text-foreground",
          )}
        >
          {displayValue != null ? money(displayValue, currency) : "—"}
        </span>
        {hasOverride ? (
          <button
            type="button"
            className="window-no-drag shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Reset cost basis to market value"
            onClick={resetOverride}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="window-no-drag shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Override cost basis"
          onClick={startEdit}
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BulkActionsBar({
  selectedCount,
  totalCount,
  allPageSelected,
  somePageSelected,
  allFilteredSelected,
  onSelectAll,
  onDeselectAll,
}: {
  selectedCount: number;
  totalCount: number;
  allPageSelected: boolean;
  somePageSelected: boolean;
  allFilteredSelected: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 z-10 grid h-11 w-full min-w-[880px] items-center border-b border-border bg-background",
        TRANSACTIONS_TABLE_COLUMN_GRID,
      )}
    >
      <div className="flex items-center px-3">
        <RowCheckbox
          ref={checkboxRef}
          checked={allPageSelected}
          aria-label="Deselect all transactions"
          onChange={onDeselectAll}
        />
      </div>
      <div className="col-span-8 flex min-w-0 items-center gap-4 px-3">
        <p className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
          {selectedCount} selected
        </p>
        {allPageSelected && !allFilteredSelected ? (
          <UnderlineFilter onClick={onSelectAll}>Select all ({totalCount})</UnderlineFilter>
        ) : null}
        <UnderlineFilter onClick={onDeselectAll}>Deselect all</UnderlineFilter>
      </div>
    </div>
  );
}

function SortIcon({ column, sort }: { column: SortColumn; sort: SortState }) {
  if (sort.column !== column) {
    return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />;
  }
  return sort.direction === "asc" ? (
    <ArrowUp className="h-3 w-3 shrink-0" />
  ) : (
    <ArrowDown className="h-3 w-3 shrink-0" />
  );
}

function SortableHead({
  column,
  sort,
  onSort,
  className,
  tooltip,
  children,
}: {
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  className?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  const isActive = sort.column === column;

  return (
    <TableHead className={className}>
      <div className="flex items-center gap-1">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="window-no-drag shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                aria-label="More information"
              >
                <Info className="h-3 w-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-left"
          onClick={() => onSort(column)}
          aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
        >
          {children}
          <SortIcon column={column} sort={sort} />
        </button>
      </div>
    </TableHead>
  );
}

function ExportMenu({
  disabled,
  onExport,
  selectionCount,
}: {
  disabled?: boolean;
  onExport: (format: "csv" | "xlsx") => void;
  selectionCount: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="h-4 w-4" />
          Export
          {selectionCount > 0 ? (
            <span className="text-muted-foreground">({selectionCount})</span>
          ) : null}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        <DropdownMenuItem onSelect={() => onExport("csv")}>CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("xlsx")}>XLSX</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WalletNameCell({
  walletId,
  walletName,
  onRenamed,
}: {
  walletId: number;
  walletName: string;
  onRenamed: (previousName: string, nextName: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function startEdit() {
    setDraft(walletName);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
  }

  async function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast({ title: "Wallet name is required" });
      cancelEdit();
      return;
    }
    if (trimmed === walletName) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      const result = await getBittrackApi().renameWallet(walletId, trimmed);
      if (!result.ok) {
        toast({ title: "Rename failed", description: result.error });
        cancelEdit();
        return;
      }
      onRenamed(walletName, trimmed);
      cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        disabled={saving}
        value={draft}
        aria-label="Wallet name"
        className="window-no-drag h-8 w-full min-w-[7rem] border-0 bg-muted/60 px-3 text-sm font-medium outline-none ring-1 ring-inset ring-border focus:ring-primary"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commitEdit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commitEdit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        }}
      />
    );
  }

  return (
    <div className="flex h-8 min-w-0 items-center px-3">
      <div className="inline-flex min-w-0 max-w-full items-center gap-0.5">
        <span className="truncate text-sm font-medium">{walletName}</span>
        <button
          type="button"
          className="window-no-drag shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Rename wallet"
          onClick={startEdit}
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function RowActionsMenu({
  txid,
  address,
  voutIndex,
  isReceive,
}: {
  txid: string;
  address: string;
  voutIndex: number | null;
  isReceive: boolean;
}) {
  const { toast } = useToast();
  const txUrl = txExplorerUrl(txid, isReceive ? voutIndex : null);
  const addrUrl = addressExplorerUrl(address);
  const txLabel = isReceive && voutIndex != null ? "UTXO" : "Transaction";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: "Address copied" });
    } catch {
      toast({
        title: "Failed to copy address",
        description: "Clipboard access was denied.",
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="On-chain actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem asChild>
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-mono text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="text-muted-foreground">{txLabel}</span>
            <span className="truncate">{shortenTxid(txid)}</span>
          </a>
        </DropdownMenuItem>
        <div className="flex items-center">
          <DropdownMenuItem asChild className="min-w-0 flex-1">
            <a
              href={addrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="text-muted-foreground">Address</span>
              <span className="truncate">{shortenAddress(address)}</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void copyAddress()}
            className="shrink-0 px-2"
            aria-label="Copy address"
          >
            <Copy className="h-3.5 w-3.5 opacity-70" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TransactionsTableSkeleton() {
  return (
    <Table className={TRANSACTIONS_TABLE_COMPACT_CLASS}>
      <TableHeader>
        <TableRow>
          {Array.from({ length: 9 }).map((_, index) => (
            <TableHead key={index}>
              <Skeleton className="h-4 w-16" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            <TableCell>
              <Skeleton className="h-4 w-4 rounded-sm" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-10" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-14" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-8 w-8 rounded-md" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const RowCheckbox = forwardRef<
  HTMLInputElement,
  {
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
    "aria-label": string;
  }
>(function RowCheckbox({ checked, disabled, onChange, ...props }, ref) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
        {...props}
      />
      <span
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-card text-primary-foreground transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          checked && "border-primary bg-primary",
        )}
      >
        {checked ? <Check className="h-3 w-3" aria-hidden /> : null}
      </span>
    </label>
  );
});
RowCheckbox.displayName = "RowCheckbox";

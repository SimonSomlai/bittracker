import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";
import {
  Brush,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HIDDEN_BTC, usePrivacyDisplay } from "@/src/settings/providers/incognito-provider";
import { useTheme } from "@/src/settings/providers/theme-provider";
import {
  normalizeChartData,
  type ChartData,
  type ChartMarker,
  type ChartSeriesPoint,
  type DashboardSummary,
} from "@/utils/bittrack-api";
import { type FiatCurrency } from "@/src/settings/utils/currency";
import { cn } from "@/utils/cn";
import { formatDate, gainLossLabel } from "@/utils/format";

const CHART_PLOT_CLASS = cn(
  "[&_.recharts-surface]:fill-transparent",
  "[&_.recharts-wrapper.flow-dot-hovered_.recharts-active-dot]:opacity-0",
  "[&_.recharts-brush>rect:first-child]:stroke-transparent",
  "[&_.recharts-brush-texts_text]:fill-muted-foreground",
  "[&_.recharts-brush-texts_text]:text-[11px]",
  "[&_.recharts-brush-slide]:fill-btc/30",
  "[&_.recharts-brush-traveller>rect]:fill-muted-foreground/50",
  "[&_.recharts-brush-traveller:hover>rect]:fill-btc",
  "[&_.recharts-brush-traveller:focus-visible>rect]:fill-btc",
  "[&_.recharts-brush-traveller:focus-visible]:outline [&_.recharts-brush-traveller:focus-visible]:outline-2 [&_.recharts-brush-traveller:focus-visible]:outline-offset-1 [&_.recharts-brush-traveller:focus-visible]:outline-btc/70",
  "[&_.recharts-brush-traveller]:cursor-ew-resize",
  "[&_.recharts-brush-slide]:cursor-grab active:cursor-grabbing",
);

const BRUSH_INTERACTING_CLASS =
  "[&_.recharts-brush-traveller>rect]:fill-btc [&_.recharts-brush-slide]:fill-btc/45";

const BRUSH_ZOOMED_CLASS = "[&_.recharts-brush-traveller>rect]:fill-btc";

const RAPID_DBLCLICK_MS = 280;

function setFlowDotHovered(target: SVGGElement, hovered: boolean) {
  target.ownerSVGElement
    ?.closest(".recharts-wrapper")
    ?.classList.toggle("flow-dot-hovered", hovered);
}

interface BtcChartProps {
  chart: ChartData;
  summary: DashboardSummary;
  currency: FiatCurrency;
  loading?: boolean;
  selectionActive?: boolean;
}

function getChartColors(theme: "light" | "dark") {
  const isDark = theme === "dark";
  return {
    axis: isDark ? "#FAFAFA" : "#171717",
    tick: isDark ? "#FAFAFA" : "#52525B",
    cursor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)",
    dotStroke: isDark ? "#000000" : "#FFFFFF",
    brushTrack: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    brushAccent: "#22D3EE",
  };
}

function formatBrushDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function BrushTraveller({
  x = 0,
  y = 0,
  width = 12,
  height = 24,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const barWidth = 2;
  const barX = x + (width - barWidth) / 2;
  const inset = Math.min(5, height * 0.22);

  return (
    <rect x={barX} y={y + inset} width={barWidth} height={Math.max(height - inset * 2, 4)} rx={1} />
  );
}

function ChartTooltip({
  active,
  label,
  payload,
  currency,
  markersByDate,
  series,
  flowHoverDate,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string; payload?: ChartSeriesPoint }>;
  currency: FiatCurrency;
  markersByDate: Map<string, ChartMarker[]>;
  series: ChartSeriesPoint[];
  flowHoverDate: string | null;
}) {
  const { money, btc, btcAmountLabel, incognito } = usePrivacyDisplay();

  const hoveredDate = typeof label === "string" ? label : payload?.[0]?.payload?.date;
  const dateKey =
    flowHoverDate ?? (hoveredDate ? resolveTooltipDate(hoveredDate, series, markersByDate) : "");

  if (!dateKey) return null;
  if (!flowHoverDate && (!active || !payload?.length)) return null;

  const point =
    series.find((entry) => entry.date === dateKey) ??
    payload?.find((entry) => entry.dataKey === "portfolioValue")?.payload ??
    payload?.[0]?.payload;
  if (!point) return null;

  const markers = markersByDate.get(dateKey) ?? [];

  return (
    <div className="min-w-[14rem] rounded-lg border border-border/80 bg-card/95 px-3 py-2.5 text-sm shadow-xl backdrop-blur-sm">
      <div className="font-medium">{formatDate(dateKey)}</div>
      <div className="mt-1.5 space-y-1 text-xs">
        <TooltipMetric label="BTC Price" value={money(point.btcPrice, currency)} />
        <TooltipMetric label="Portfolio value" value={money(point.portfolioValue, currency)} />
        <TooltipMetric
          label="BTC"
          value={point.cumulativeBtc != null ? btc(point.cumulativeBtc) : "—"}
        />
      </div>
      {markers.length > 0 ? (
        <>
          <div className="my-2 border-t border-border/60" />
          <div className="type-overline mb-1.5">Transactions</div>
          <ul className="space-y-1 text-xs">
            {markers.map((marker, index) => {
              const fiatValue = marker.btcPrice != null ? marker.btcAmount * marker.btcPrice : null;
              const isInflow = marker.flow === "inflow";

              return (
                <li
                  key={`${marker.flow}-${marker.walletName}-${index}`}
                  className={cn("flex items-start gap-1.5", isInflow ? "text-btc" : "text-red-500")}
                >
                  <span className="min-w-0 flex-1">
                    {incognito
                      ? HIDDEN_BTC
                      : `${isInflow ? "+" : "−"}${btcAmountLabel(marker.btcAmount)}`}
                    {marker.walletName ? ` · ${marker.walletName}` : ""}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {money(fiatValue, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function resolveTooltipDate(
  hoveredDate: string,
  series: ChartSeriesPoint[],
  markersByDate: Map<string, ChartMarker[]>,
) {
  if (markersByDate.has(hoveredDate)) return hoveredDate;

  const hoveredIndex = series.findIndex((point) => point.date === hoveredDate);
  if (hoveredIndex < 0) return hoveredDate;

  let nearestMarkerDate: string | null = null;
  let nearestDistance = Infinity;

  for (let index = 0; index < series.length; index += 1) {
    const date = series[index]!.date;
    if (!markersByDate.has(date)) continue;

    const distance = Math.abs(index - hoveredIndex);
    if (distance <= 12 && distance < nearestDistance) {
      nearestDistance = distance;
      nearestMarkerDate = date;
    }
  }

  return nearestMarkerDate ?? hoveredDate;
}

function TooltipMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

function FlowDot({
  cx,
  cy,
  date,
  flowFill,
  dotStroke,
  onFlowHover,
}: {
  cx?: number;
  cy?: number;
  date: string;
  flowFill?: string;
  dotStroke: string;
  onFlowHover: (date: string | null) => void;
}) {
  if (cx == null || cy == null || !flowFill) return null;

  const baseTransform = `translate(${cx}, ${cy})`;

  return (
    <g
      className="flow-dot"
      transform={baseTransform}
      onMouseEnter={(event) => {
        const target = event.currentTarget;
        target.setAttribute("transform", `${baseTransform} scale(1.5)`);
        setFlowDotHovered(target, true);
        onFlowHover(date);
      }}
      onMouseLeave={(event) => {
        const target = event.currentTarget;
        target.setAttribute("transform", baseTransform);
        setFlowDotHovered(target, false);
        onFlowHover(null);
      }}
    >
      <circle cx={0} cy={0} r={10} fill="transparent" />
      <circle cx={0} cy={0} r={5} fill={flowFill} stroke={dotStroke} strokeWidth={1.5} />
    </g>
  );
}

export function BtcChart({
  chart: rawChart,
  summary,
  currency,
  loading = false,
  selectionActive: _selectionActive = false,
}: BtcChartProps) {
  const { theme } = useTheme();
  const { axisMoney, gainLoss } = usePrivacyDisplay();
  const colors = getChartColors(theme);
  const axisTick = { fill: colors.tick, fontSize: 12 };
  const yAxisLabelFontSize = 14;
  const chart = normalizeChartData(rawChart);
  const markersByDate = useMemo(() => {
    const map = new Map<string, ChartMarker[]>();
    for (const marker of chart.markers) {
      const existing = map.get(marker.date) ?? [];
      existing.push(marker);
      map.set(marker.date, existing);
    }
    return map;
  }, [chart.markers]);

  const flowFillByDate = useMemo(() => {
    const map = new Map<string, string>();

    for (const point of chart.series) {
      if (point.portfolioValue == null) continue;

      const markers = markersByDate.get(point.date);
      if (!markers?.length) continue;

      let inflowTotal = 0;
      let outflowTotal = 0;
      for (const marker of markers) {
        if (marker.flow === "inflow") inflowTotal += marker.btcAmount;
        else outflowTotal += marker.btcAmount;
      }

      const net = inflowTotal - outflowTotal;
      if (net === 0) continue;

      map.set(point.date, net > 0 ? "#F7931A" : "#EF4444");
    }

    return map;
  }, [chart.series, markersByDate]);

  const flowMarkers = useMemo(() => {
    const seriesByDate = new Map(chart.series.map((point) => [point.date, point]));

    return Array.from(flowFillByDate.entries()).flatMap(([date, fill]) => {
      const portfolioValue = seriesByDate.get(date)?.portfolioValue;
      if (portfolioValue == null) return [];
      return [{ date, portfolioValue, fill }];
    });
  }, [chart.series, flowFillByDate]);

  const chartSeries = useMemo(() => {
    let lastPortfolio: number | null = null;

    return chart.series.map((point) => {
      if (point.portfolioValue != null) {
        lastPortfolio = point.portfolioValue;
      }

      return {
        ...point,
        brushPreview: lastPortfolio,
      };
    });
  }, [chart.series]);

  const brushEndIndex = Math.max(chartSeries.length - 1, 0);
  const chartSeriesKey = useMemo(
    () => chart.series.map((point) => point.date).join("|"),
    [chart.series],
  );
  const [brushRange, setBrushRange] = useState({
    startIndex: 0,
    endIndex: brushEndIndex,
  });
  const [flowHoverDate, setFlowHoverDate] = useState<string | null>(null);
  const [brushInteracting, setBrushInteracting] = useState(false);
  const chartPlotRef = useRef<HTMLDivElement>(null);
  const lastSlideClickAtRef = useRef(0);
  const slideClickOriginRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setBrushRange({ startIndex: 0, endIndex: brushEndIndex });
  }, [chartSeriesKey, brushEndIndex]);

  const isBrushZoomed = brushRange.startIndex > 0 || brushRange.endIndex < brushEndIndex;

  const resetBrush = useCallback(() => {
    setBrushRange({ startIndex: 0, endIndex: brushEndIndex });
    setFlowHoverDate(null);
  }, [brushEndIndex]);

  const handleFlowHover = useCallback((date: string | null) => {
    setFlowHoverDate((prev) => (prev === date ? prev : date));
  }, []);

  const handleBrushChange = useCallback(
    ({ startIndex, endIndex }: { startIndex?: number; endIndex?: number }) => {
      if (startIndex == null || endIndex == null) return;
      setBrushRange({ startIndex, endIndex });
      setFlowHoverDate(null);
    },
    [],
  );

  useEffect(() => {
    const root = chartPlotRef.current;
    if (!root || chart.series.length === 0) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".recharts-brush")) return;

      setBrushInteracting(true);

      if (target.closest(".recharts-brush-slide")) {
        slideClickOriginRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
      } else {
        slideClickOriginRef.current = null;
      }

      const traveller = target.closest(".recharts-brush-traveller") as SVGGElement | null;
      traveller?.focus({ preventScroll: true });
    };

    const handlePointerUp = () => {
      setBrushInteracting(false);
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".recharts-brush-traveller")) return;
      if (!target.closest(".recharts-brush-slide")) return;
      if (!isBrushZoomed) return;

      const origin = slideClickOriginRef.current;
      if (origin) {
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        if (dx * dx + dy * dy > 16) {
          lastSlideClickAtRef.current = 0;
          return;
        }
      }

      const now = event.timeStamp;
      if (now - lastSlideClickAtRef.current <= RAPID_DBLCLICK_MS) {
        lastSlideClickAtRef.current = 0;
        event.preventDefault();
        resetBrush();
        return;
      }
      lastSlideClickAtRef.current = now;
    };

    root.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      root.removeEventListener("click", handleClick);
    };
  }, [chart.series.length, isBrushZoomed, resetBrush]);

  const summaryGain = gainLoss(summary.unrealizedGain, summary.totalCostBasis, currency);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Portfolio</h2>
      <Card className="overflow-hidden">
        <CardContent className="space-y-6 p-6">
          {!loading && chart.series.length > 0 ? <ChartLegend currency={currency} /> : null}
          <div className="h-[42vh] min-h-[300px]">
            {loading ? (
              <ChartPlotSkeleton />
            ) : chart.series.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Add a wallet and sync to populate the chart.
              </div>
            ) : (
              <div
                ref={chartPlotRef}
                className={cn(
                  "relative h-full",
                  isBrushZoomed && BRUSH_ZOOMED_CLASS,
                  brushInteracting && BRUSH_INTERACTING_CLASS,
                )}
              >
                <ResponsiveContainer width="100%" height="100%" className={CHART_PLOT_CLASS}>
                  <ComposedChart
                    key={theme}
                    data={chartSeries}
                    margin={{ top: 36, right: 4, left: 4, bottom: 0 }}
                    style={{ background: "transparent" }}
                  >
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString(undefined, {
                          month: "short",
                          year: "numeric",
                        })
                      }
                      stroke={colors.axis}
                      tick={axisTick}
                      axisLine={{ stroke: colors.axis }}
                      tickLine={false}
                      dy={6}
                      minTickGap={48}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(value) => axisMoney(value, currency)}
                      stroke={colors.axis}
                      tick={axisTick}
                      width={84}
                      axisLine={{ stroke: colors.axis }}
                      tickLine={false}
                      label={{
                        value: "BTC Price",
                        position: "top",
                        offset: 16,
                        fill: colors.axis,
                        fontSize: yAxisLabelFontSize,
                        style: { textAnchor: "start" },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) => axisMoney(value, currency)}
                      stroke={colors.axis}
                      tick={axisTick}
                      width={84}
                      axisLine={{ stroke: colors.axis }}
                      tickLine={false}
                      label={{
                        value: "Portfolio Value",
                        position: "top",
                        offset: 16,
                        fill: colors.axis,
                        fontSize: yAxisLabelFontSize,
                        style: { textAnchor: "end" },
                      }}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          currency={currency}
                          markersByDate={markersByDate}
                          series={chart.series}
                          flowHoverDate={flowHoverDate}
                        />
                      }
                      cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="btcPrice"
                      stroke="#F7931A"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={false}
                      style={{
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                      }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="portfolioValue"
                      stroke="#22D3EE"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={{
                        r: 4,
                        fill: "#22D3EE",
                        stroke: colors.dotStroke,
                        strokeWidth: 1.5,
                      }}
                      style={{
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                      }}
                    />
                    <Brush
                      dataKey="date"
                      height={32}
                      stroke={colors.tick}
                      fill={colors.brushTrack}
                      travellerWidth={12}
                      traveller={<BrushTraveller />}
                      padding={{ top: 4, right: 0, bottom: 2, left: 0 }}
                      alwaysShowText
                      startIndex={brushRange.startIndex}
                      endIndex={brushRange.endIndex}
                      tickFormatter={formatBrushDate}
                      onChange={handleBrushChange}
                    >
                      <LineChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="date" hide type="category" />
                        <YAxis hide domain={["dataMin", "dataMax"]} />
                        <Line
                          type="monotone"
                          dataKey="brushPreview"
                          stroke={colors.brushAccent}
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </Brush>
                    {flowMarkers.map(({ date, portfolioValue, fill }) => (
                      <ReferenceDot
                        key={date}
                        x={date}
                        y={portfolioValue}
                        yAxisId="right"
                        r={0}
                        fill="transparent"
                        stroke="transparent"
                        ifOverflow="extendDomain"
                        shape={(props: { cx?: number; cy?: number }) => (
                          <FlowDot
                            cx={props.cx}
                            cy={props.cy}
                            date={date}
                            flowFill={fill}
                            dotStroke={colors.dotStroke}
                            onFlowHover={handleFlowHover}
                          />
                        )}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {loading ? (
            <ChartBottomBarSkeleton />
          ) : (
            <ChartBottomBar summaryGain={summaryGain} summary={summary} currency={currency} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ChartLegend({ currency, className }: { currency: FiatCurrency; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-5 gap-y-2", className)}>
      <LegendItem
        label="Inflows"
        icon={<ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-btc" aria-hidden />}
      />
      <LegendItem
        label="Outflows"
        icon={<ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />}
      />
      <LegendItem label="BTC Price" icon={<span className="h-px w-4 bg-btc" aria-hidden />} />
      <LegendItem
        label={`Portfolio Value (${currency})`}
        icon={<span className="h-px w-4 bg-portfolio" aria-hidden />}
      />
    </div>
  );
}

function LegendItem({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <span className="type-overline flex shrink-0 items-center gap-2 whitespace-nowrap">
      {icon}
      {label}
    </span>
  );
}

function ChartBottomBar({
  summary,
  currency,
  summaryGain,
}: {
  summary: DashboardSummary;
  currency: FiatCurrency;
  summaryGain: { text: string; className: string };
}) {
  const { money, btc, incognito } = usePrivacyDisplay();

  const statMoney = (value: number) => (!incognito && value === 0 ? "—" : money(value, currency));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-6 border-t border-border pt-6">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-y-8 sm:grid-cols-4 sm:gap-y-0">
          <ChartStat
            label="Total balance"
            value={btc(summary.totalBtc)}
            secondaryValue={statMoney(summary.currentPortfolioValue)}
            accent
            className="px-4 text-center sm:border-r sm:border-border"
          />
          <ChartStat
            label="BTC Price"
            value={money(summary.currentBtcPrice, currency)}
            className="px-4 text-center sm:border-r sm:border-border"
          />
          <ChartStat
            label={gainLossLabel(summary.unrealizedGain)}
            value={summaryGain.text}
            valueClassName={summaryGain.className}
            tooltip={`Unrealized gain or loss in ${currency}: current portfolio value minus total cost basis.`}
            className="px-4 text-center sm:border-r sm:border-border"
          />
          <ChartStat
            label="Cost basis"
            value={statMoney(summary.totalCostBasis)}
            className="px-4 text-center"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function ChartStat({
  label,
  value,
  secondaryValue,
  accent = false,
  valueClassName,
  secondaryClassName,
  tooltip,
  className,
}: {
  label: string;
  value: string;
  secondaryValue?: string;
  accent?: boolean;
  valueClassName?: string;
  secondaryClassName?: string;
  tooltip?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="type-overline inline-flex items-center justify-center gap-1">
        {tooltip ? (
          <UiTooltip>
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
          </UiTooltip>
        ) : null}
        {label}
      </div>
      <div
        className={cn(
          "type-stat mt-1",
          valueClassName ?? (accent ? "text-btc" : "text-foreground"),
        )}
      >
        {value}
      </div>
      {secondaryValue ? (
        <div className={cn("type-stat mt-0.5 text-foreground", secondaryClassName)}>
          {secondaryValue}
        </div>
      ) : null}
    </div>
  );
}

function ChartBottomBarSkeleton() {
  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-6 px-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex min-w-[9rem] flex-col items-center space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            {index === 0 ? <Skeleton className="h-7 w-24" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartPlotSkeleton() {
  return (
    <div className="relative h-full rounded-lg">
      <div className="absolute inset-0 flex flex-col justify-between py-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-px w-full bg-foreground/10 dark:bg-white/10" />
        ))}
      </div>
      <svg
        className="absolute inset-0 h-full w-full text-foreground/20 dark:text-white/20"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0,160 C60,140 100,120 140,100 S220,60 280,80 S360,40 400,20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="animate-pulse opacity-60"
        />
        <path
          d="M0,180 C80,170 120,150 180,130 S260,90 320,70 S380,50 400,30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="animate-pulse opacity-40"
        />
      </svg>
    </div>
  );
}

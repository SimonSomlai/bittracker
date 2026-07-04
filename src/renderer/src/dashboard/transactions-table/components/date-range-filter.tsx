import { forwardRef, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { endOfYear, startOfYear, subDays, subMonths } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateRangeLabel, parseDateKey, toDateKey } from "../utils/date-keys";
import { cn } from "@/utils/cn";

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onApply: (from: string, to: string) => void;
  onClear: () => void;
  disabled?: boolean;
  defaultMonth?: Date;
  bounds?: {
    from: string;
    to: string;
  };
}

function toRange(from: string, to: string): DateRange | undefined {
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);
  if (!fromDate && !toDate) return undefined;
  return { from: fromDate, to: toDate };
}

function fromRange(range: DateRange | undefined) {
  return {
    from: range?.from ? toDateKey(range.from) : "",
    to: range?.to ? toDateKey(range.to) : "",
  };
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onApply,
  onClear,
  disabled = false,
  defaultMonth,
  bounds,
}: DateRangeFilterProps) {
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();
  const [month, setMonth] = useState<Date>(defaultMonth ?? today);

  const earliestDate = useMemo(
    () => (bounds?.from ? parseDateKey(bounds.from) : undefined),
    [bounds?.from],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const range = toRange(dateFrom, dateTo);
      setDraftRange(range);
      setMonth(range?.from ?? range?.to ?? defaultMonth ?? today);
    }
    setOpen(nextOpen);
  }

  function applyRange() {
    const next = fromRange(draftRange);
    onApply(next.from, next.to);
    setOpen(false);
  }

  function clearRange() {
    setDraftRange(undefined);
    onClear();
    setOpen(false);
  }

  function applyAllTime() {
    setDraftRange(undefined);
    onApply("", "");
    setOpen(false);
  }

  function applyPreset(range: DateRange | undefined) {
    if (!range?.from || !range.to) return;
    setDraftRange(range);
    setMonth(range.from ?? range.to ?? today);
  }

  function applyPresetNow(range: DateRange | undefined) {
    if (!range?.from || !range.to) return;
    const next = fromRange(range);
    setDraftRange(range);
    onApply(next.from, next.to);
    setOpen(false);
  }

  const quickPresets = useMemo(() => {
    const items: Array<{ id: string; label: string; range?: DateRange }> = [
      { id: "all", label: "All time" },
      {
        id: "12m",
        label: "Last 12 months",
        range: { from: subMonths(today, 12), to: today },
      },
      {
        id: "90d",
        label: "Last 90 days",
        range: { from: subDays(today, 90), to: today },
      },
      {
        id: "30d",
        label: "Last 30 days",
        range: { from: subDays(today, 30), to: today },
      },
      {
        id: "ytd",
        label: "Year to date",
        range: { from: startOfYear(today), to: today },
      },
    ];

    return items;
  }, [today]);

  const yearPresets = useMemo(() => {
    if (!earliestDate) return [];

    const startYear = earliestDate.getFullYear();
    const currentYear = today.getFullYear();
    const years: Array<{ id: string; label: string; range: DateRange }> = [];

    for (let year = currentYear; year >= startYear; year -= 1) {
      const anchor = new Date(year, 0, 1);
      years.push({
        id: `year-${year}`,
        label: String(year),
        range: {
          from: startOfYear(anchor),
          to: year === currentYear ? today : endOfYear(anchor),
        },
      });
    }

    return years;
  }, [earliestDate, today]);

  const allPresets = useMemo(() => [...quickPresets, ...yearPresets], [quickPresets, yearPresets]);

  const activePresetId = useMemo(() => {
    if (!draftRange?.from && !draftRange?.to) {
      return "all";
    }

    if (!draftRange?.from || !draftRange.to) return null;
    const draftFrom = toDateKey(draftRange.from);
    const draftTo = toDateKey(draftRange.to);

    return (
      allPresets.find((preset) => {
        if (preset.id === "all" || !preset.range?.from || !preset.range.to) return false;
        return toDateKey(preset.range.from) === draftFrom && toDateKey(preset.range.to) === draftTo;
      })?.id ?? null
    );
  }, [draftRange, allPresets]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <FilterChip active={dateFrom.length > 0 || dateTo.length > 0} disabled={disabled}>
          <CalendarIcon className="h-3 w-3 shrink-0 opacity-70" />
          {formatDateRangeLabel(dateFrom, dateTo)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </FilterChip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[36rem] p-0">
        <div className="space-y-2.5 border-b border-border px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {quickPresets.map((preset) => (
              <PresetButton
                key={preset.id}
                active={activePresetId === preset.id}
                onClick={() => (preset.id === "all" ? applyAllTime() : applyPreset(preset.range))}
              >
                {preset.label}
              </PresetButton>
            ))}
          </div>
          {yearPresets.length > 0 ? (
            <div>
              <p className="type-overline mb-1.5">Calendar years</p>
              <div className="flex flex-wrap gap-1.5">
                {yearPresets.map((preset) => (
                  <PresetButton
                    key={preset.id}
                    active={activePresetId === preset.id}
                    onClick={() => applyPresetNow(preset.range)}
                  >
                    {preset.label}
                  </PresetButton>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <Calendar
          mode="range"
          selected={draftRange}
          onSelect={setDraftRange}
          month={month}
          onMonthChange={setMonth}
          captionLayout="dropdown"
          startMonth={earliestDate ?? new Date(2010, 0, 1)}
          endMonth={today}
          reverseYears
          numberOfMonths={2}
          disabled={{ after: today }}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {formatDateRangeLabel(
              draftRange?.from ? toDateKey(draftRange.from) : "",
              draftRange?.to ? toDateKey(draftRange.to) : "",
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={clearRange}
            >
              Clear
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={applyRange}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetButton({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "window-no-drag rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const FilterChip = forwardRef<
  HTMLButtonElement,
  {
    active?: boolean;
    disabled?: boolean;
    children: ReactNode;
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function FilterChip({ active, disabled, children, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
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
FilterChip.displayName = "DateRangeFilterChip";

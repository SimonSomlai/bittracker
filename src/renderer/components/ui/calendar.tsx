import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayButtonProps,
  type DayPickerProps,
} from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export type CalendarProps = DayPickerProps;

function CalendarDayButton({ day: _day, modifiers, className, ...props }: DayButtonProps) {
  const { outside, disabled, today, range_start, range_end, range_middle, selected } = modifiers;

  return (
    <button
      {...props}
      type="button"
      className={cn(
        "relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-normal transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        !selected && !range_middle && "hover:bg-muted",
        today && !selected && "font-semibold text-primary",
        range_middle &&
          "rounded-none bg-transparent text-foreground hover:bg-primary/10 dark:hover:bg-primary/15",
        range_start &&
          "rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground",
        range_end &&
          "rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground",
        selected &&
          !range_start &&
          !range_end &&
          !range_middle &&
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        outside && "text-muted-foreground/45",
        disabled && "pointer-events-none opacity-30",
        className,
      )}
    />
  );
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn("relative", defaults.root),
        months: cn("flex flex-col gap-4 sm:flex-row sm:gap-8", defaults.months),
        month: cn("flex flex-col gap-3", defaults.month),
        month_caption: cn(
          "relative flex h-9 items-center justify-center gap-1 px-1",
          defaults.month_caption,
        ),
        caption_label: cn("hidden text-sm font-medium", defaults.caption_label),
        dropdowns: cn("flex items-center justify-center gap-1.5", defaults.dropdowns),
        dropdown_root: cn("relative", defaults.dropdown_root),
        dropdown: cn(
          "window-no-drag h-8 appearance-none rounded-md border border-border bg-background pl-2 pr-7 text-sm font-medium text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          defaults.dropdown,
        ),
        months_dropdown: cn("capitalize", defaults.months_dropdown),
        years_dropdown: cn("", defaults.years_dropdown),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", defaults.nav),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-8 w-8 p-0 text-muted-foreground hover:text-foreground",
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-8 w-8 p-0 text-muted-foreground hover:text-foreground",
          defaults.button_next,
        ),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "w-9 text-center text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground",
          defaults.weekday,
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn(
          "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
          defaults.day,
        ),
        day_button: cn("h-9 w-9 p-0 font-normal", defaults.day_button),
        today: "font-semibold",
        outside: "text-muted-foreground/45",
        disabled: "text-muted-foreground opacity-30",
        hidden: "invisible",
        range_middle: "bg-primary/15 dark:bg-primary/20",
        range_start: "rounded-l-md bg-primary/15 dark:bg-primary/20",
        range_end: "rounded-r-md bg-primary/15 dark:bg-primary/20",
        selected: "",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("h-4 w-4", chevronClassName)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

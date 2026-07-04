import * as React from "react";
import { cn } from "@/utils/cn";

export function Table({
  className,
  containerClassName,
  overlay,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  containerClassName?: string;
  overlay?: React.ReactNode;
}) {
  return (
    <div className={cn("relative w-full min-w-0 overflow-x-auto", containerClassName)}>
      {overlay}
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-border transition-colors hover:bg-muted/50", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-11 px-3 text-left align-middle type-overline whitespace-normal", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 py-3 align-middle text-sm whitespace-normal break-words", className)}
      {...props}
    />
  );
}

import { cn } from "@/utils/cn";

type AppLogoSize = "sm" | "md" | "lg";

const titleStyles: Record<AppLogoSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
};

const taglineStyles: Record<AppLogoSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-sm",
};

export function AppLogo({
  size = "md",
  showTagline = false,
  className,
}: {
  size?: AppLogoSize;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("select-none", className)}>
      <h1 className={cn("font-semibold tracking-tight", titleStyles[size])}>
        <span className="text-btc">₿</span>itTracker
      </h1>
      {showTagline ? (
        <p className={cn("mt-1 text-muted-foreground", taglineStyles[size])}>
          Simple Bitcoin Accounting
        </p>
      ) : null}
    </div>
  );
}

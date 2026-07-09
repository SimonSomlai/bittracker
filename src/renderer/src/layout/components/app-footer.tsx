import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { BUILD_INFO, buildCommitUrl, buildReleaseUrl } from "@/src/layout/utils/build-info";
import { pageShellClass } from "@/src/layout/utils/electron-chrome";
import { cn } from "@/utils/cn";

function useTorStatus() {
  const [status, setStatus] = useState<{ running: boolean; exitIp: string | null } | null>(null);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    const api = window.bittrack;
    if (!api?.getTorStatus) return;

    api
      .getTorStatus()
      .then(setStatus)
      .catch(() => setStatus({ running: false, exitIp: null }));

    const cleanups: (() => void)[] = [];

    if (api.onTorStatusChange) {
      cleanups.push(
        api.onTorStatusChange((running) =>
          setStatus((prev) => ({ running, exitIp: running ? (prev?.exitIp ?? null) : null })),
        ),
      );
    }
    if (api.onTorRotatingChange) {
      cleanups.push(api.onTorRotatingChange(setRotating));
    }
    if (api.onTorIpChange) {
      cleanups.push(
        api.onTorIpChange((ip) => setStatus((prev) => (prev ? { ...prev, exitIp: ip } : prev))),
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return { status, rotating };
}

export function AppFooter({ className }: { className?: string }) {
  const commitUrl = buildCommitUrl(BUILD_INFO);
  const releaseUrl = buildReleaseUrl(BUILD_INFO);
  const isDevBuild = import.meta.env.DEV;
  const hasCommit = BUILD_INFO.commit !== "dev";
  const { status: torStatus, rotating: torRotating } = useTorStatus();

  return (
    <footer
      className={cn("window-no-drag shrink-0 border-t border-border bg-background", className)}
    >
      <div className={pageShellClass("flex items-center justify-end py-2.5")}>
        <p className="flex items-center gap-2 text-right text-xs text-muted-foreground">
          <span>v{BUILD_INFO.version}</span>
          {hasCommit ? (
            <>
              <span className="mx-1.5 opacity-50">·</span>
              {commitUrl ? (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline-offset-4 hover:text-foreground hover:underline"
                >
                  {BUILD_INFO.commit}
                </a>
              ) : (
                <span className="font-mono">{BUILD_INFO.commit}</span>
              )}
            </>
          ) : null}
          {isDevBuild ? (
            <span className="ml-1.5 opacity-70">(dev)</span>
          ) : releaseUrl ? (
            <>
              <span className="mx-1.5 opacity-50">·</span>
              <a
                href={releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                release
              </a>
            </>
          ) : null}
          {torStatus?.running ? (
            <>
              <span className="mx-1.5 opacity-50">·</span>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                {torRotating ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                )}
                {torRotating ? "Tor rotating..." : "Tor Connected"}
                {torStatus.exitIp ? (
                  torRotating ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" />
                  ) : (
                    <span className="opacity-70">· {torStatus.exitIp}</span>
                  )
                ) : null}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </footer>
  );
}

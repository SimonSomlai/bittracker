import { BUILD_INFO, buildCommitUrl, buildReleaseUrl } from "@/src/layout/utils/build-info";
import { pageShellClass } from "@/src/layout/utils/electron-chrome";
import { cn } from "@/utils/cn";

export function AppFooter({ className }: { className?: string }) {
  const commitUrl = buildCommitUrl(BUILD_INFO);
  const releaseUrl = buildReleaseUrl(BUILD_INFO);
  const isDevBuild = import.meta.env.DEV;
  const hasCommit = BUILD_INFO.commit !== "dev";

  return (
    <footer
      className={cn("window-no-drag shrink-0 border-t border-border bg-background", className)}
    >
      <div className={pageShellClass("flex justify-end py-2.5")}>
        <p className="text-right text-xs text-muted-foreground">
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
        </p>
      </div>
    </footer>
  );
}

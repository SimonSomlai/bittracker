import { cn } from "@/utils/cn";

function isMacTitlebar() {
  return typeof window !== "undefined" && window.bittrack?.platform === "darwin";
}

export function macTitlebarTopClass() {
  return isMacTitlebar() ? "pt-9" : "";
}

/** Shared horizontal gutters for header + page content (clears macOS traffic lights). */
function pageGutterClass() {
  return isMacTitlebar() ? "pl-[4.5rem] pr-6" : "px-6";
}

export function pageShellClass(className?: string) {
  return cn("mx-auto w-full max-w-7xl", pageGutterClass(), className);
}

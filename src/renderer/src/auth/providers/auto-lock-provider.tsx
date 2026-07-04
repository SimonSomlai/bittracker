import { useEffect, type ReactNode } from "react";
import { getBittrackApi } from "@/utils/bittrack-client";

const AUTO_LOCK_MINUTES = 15;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

export function AutoLockProvider({
  children,
  onLock,
}: {
  children: ReactNode;
  onLock: () => void;
}) {
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleLock = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(
        async () => {
          await getBittrackApi().lock();
          onLock();
        },
        AUTO_LOCK_MINUTES * 60 * 1000,
      );
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, scheduleLock, { passive: true });
    }
    scheduleLock();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, scheduleLock);
      }
    };
  }, [onLock]);

  return children;
}

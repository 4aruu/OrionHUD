import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Busy state for one async action. A second call while the first is still
 * running is ignored (no double saves from a double click or Enter + click).
 */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return [busy, run] as const;
}

import { useCallback, useMemo, useRef, useState } from "react";
import type { ToastState } from "../components/Toast";
import { errorMessage } from "../lib/format";
import type { Ui } from "../lib/ui";

/** The toast state and the `Ui` actions every page passes down (panel and welcome tab). */
export function useUi(reload: () => Promise<void>): { ui: Ui; toast: ToastState | null; closeToast: () => void } {
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const closeToast = useCallback(() => setToast(null), []);

  const ui: Ui = useMemo(
    () => ({
      toast: (t) => setToast({ ...t, id: ++toastId.current }),
      reload,
      run: async (fn, okText) => {
        try {
          const result = await fn();
          await reload();
          if (okText) setToast({ id: ++toastId.current, kind: "info", text: okText });
          return result;
        } catch (err) {
          await reload();
          setToast({ id: ++toastId.current, kind: "error", text: errorMessage(err) });
          return undefined;
        }
      },
    }),
    [reload]
  );

  return { ui, toast, closeToast };
}

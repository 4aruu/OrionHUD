import { useEffect } from "react";
import { AnimatePresence, m, useIsPresent } from "motion/react";
import { presence, toast as toastMotion } from "../lib/motion";

export interface ToastState {
  id: number;
  text: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void };
}

export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.action ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  // The live region stays mounted (so it's announced); only its card animates.
  // mode="wait": one toast at a time, the next rises once the last has gone.
  return (
    <div className="toast-region" role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {toast && <ToastCard key={toast.id} toast={toast} onClose={onClose} />}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  // A leaving toast can't be clicked again (no double Undo) or found by assistive tech.
  const leaving = !useIsPresent();
  return (
    <m.div className={`toast toast-${toast.kind}`} variants={toastMotion} {...presence} inert={leaving || undefined} aria-hidden={leaving || undefined}>
      <span>{toast.text}</span>
      {toast.action && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            toast.action?.run();
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="icon-btn" aria-label="Dismiss" data-tip="Dismiss" onClick={onClose}>
        ×
      </button>
    </m.div>
  );
}

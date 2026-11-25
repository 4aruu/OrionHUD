import { useEffect } from "react";

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

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className={`toast toast-${toast.kind}`} key={toast.id}>
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
        </div>
      )}
    </div>
  );
}

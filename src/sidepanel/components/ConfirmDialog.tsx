import { useId, useRef, type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";

interface Props {
  /** Names the exact thing, e.g. Delete workflow “Payments API v2”? */
  title: string;
  children: ReactNode;
  /** Destructive verb + noun, e.g. "Delete workflow". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for irreversible actions. Cancel has focus, so Enter never destroys by accident. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ref = useDialog(onCancel, cancelRef);
  const titleId = useId();
  const bodyId = useId();

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} className="sheet confirm" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h3 id={titleId}>{title}</h3>
        <div id={bodyId} className="confirm-body">
          {children}
        </div>
        <div className="confirm-actions">
          <button ref={cancelRef} className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

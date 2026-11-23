import { useId, useState, type ReactNode } from "react";

interface Props {
  label: ReactNode;
  /** Small count shown after the label, e.g. number of notes. */
  count?: number;
  /** Quiet text on the right of the header. */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A section that stays closed until asked for, so the screen shows one thing at a time. */
export function Disclosure({ label, count, hint, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="disclosure">
      <button className="section-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className={`caret ${open ? "caret-open" : ""}`} aria-hidden="true">
          ▸
        </span>
        <span className="disclosure-label">{label}</span>
        {count ? <span className="count">{count}</span> : null}
        {hint && <span className="muted small hint-right">{hint}</span>}
      </button>
      {open && (
        <div id={id} className="disclosure-body">
          {children}
        </div>
      )}
    </section>
  );
}

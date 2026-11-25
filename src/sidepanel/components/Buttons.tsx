import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * A button for an async action. While busy it ignores clicks (it stays
 * focusable, unlike `disabled`, so keyboard focus isn't dropped) and, after a
 * short delay so quick saves don't flash, swaps its label for a spinner. Label
 * and spinner share one grid cell, so the button never changes width.
 */
export function BusyButton({ busy, children, className = "", onClick, ...rest }: ButtonProps & { busy: boolean }) {
  return (
    <button
      {...rest}
      className={`${className} has-swap`}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault(); // also stops a submit button from resubmitting its form
          return;
        }
        onClick?.(e);
      }}
    >
      <span className="swap-item" data-off={busy || undefined}>
        {children}
      </span>
      <span className="swap-item" data-off={!busy || undefined} aria-hidden="true">
        <span className="spinner" />
      </span>
    </button>
  );
}

const COPIED_MS = 1600;

/**
 * Copies on click and briefly reads "Copied ✓" in place, at the same width.
 * `copy` resolves to whether it worked; failures report themselves (toast).
 */
export function CopyButton({ copy, children, className = "" }: { copy: () => Promise<boolean>; children: ReactNode; className?: string }) {
  const [copiedAt, setCopiedAt] = useState(0);
  const copied = copiedAt > 0;

  useEffect(() => {
    if (!copiedAt) return;
    const t = setTimeout(() => setCopiedAt(0), COPIED_MS);
    return () => clearTimeout(t);
  }, [copiedAt]);

  return (
    <>
      <button
        type="button"
        className={`${className} has-swap`}
        onClick={() => {
          void copy().then((ok) => {
            if (ok) setCopiedAt(Date.now());
          });
        }}
      >
        <span className="swap-item" data-off={copied || undefined} aria-hidden={copied || undefined}>
          {children}
        </span>
        <span className="swap-item" data-off={!copied || undefined} aria-hidden={!copied || undefined}>
          Copied ✓
        </span>
      </button>
      {copied && (
        <span className="sr-only" role="status">
          Copied
        </span>
      )}
    </>
  );
}

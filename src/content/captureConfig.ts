// Config and stylesheet for the in-page capture box. Kept free of DOM/chrome
// access at module level so it can be unit-tested and bundled into capture.js.

import { BEIGE, DARK, cssVars } from "../shared/palette";
import { parseThemePref, type ThemePref } from "../shared/theme";

export interface CaptureConfig {
  mode: "save" | "inbox";
  label: string;
  theme: ThemePref;
}

export function parseCaptureConfig(raw: unknown): CaptureConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<Record<keyof CaptureConfig, unknown>>;
  if (r.mode !== "save" && r.mode !== "inbox") return null;
  return {
    mode: r.mode,
    label: typeof r.label === "string" ? r.label.slice(0, 120) : "",
    theme: parseThemePref(r.theme),
  };
}

const RULES = `
.backdrop { position: fixed; inset: 0; z-index: 2147483647; display: flex; justify-content: center;
  align-items: flex-start; padding-top: 18vh; background: var(--scrim); }
.box { width: min(560px, calc(100vw - 32px)); background: var(--surface); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: 12px; box-shadow: 0 20px 60px var(--shadow-color);
  padding: 14px 16px; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.label { font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--accent-text); text-transform: uppercase;
  margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
input { all: unset; box-sizing: border-box; width: 100%; padding: 10px 12px; border-radius: 8px;
  background: var(--surface-2); border: 1px solid var(--line); color: var(--text); font-size: 14px; }
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.hint { margin-top: 8px; font-size: 11px; color: var(--text-3); display: flex; justify-content: space-between; gap: 8px; }
.hint .brand { white-space: nowrap; }
.hint.ok { color: var(--ok); } .hint.err { color: var(--red); }
@media (prefers-reduced-motion: no-preference) { .box { animation: in 140ms ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } } }
`;

export function captureStyles(theme: ThemePref): string {
  const vars =
    theme === "light"
      ? `:host { all: initial; ${cssVars(BEIGE)} }`
      : theme === "dark"
        ? `:host { all: initial; ${cssVars(DARK)} }`
        : `:host { all: initial; ${cssVars(DARK)} }\n@media (prefers-color-scheme: light) { :host { ${cssVars(BEIGE)} } }`;
  return vars + RULES;
}

// Colour tokens for both themes. DARK mirrors the :root block in
// src/sidepanel/index.css; BEIGE is the warm light theme.
export type TokenName =
  | "bg" | "surface" | "surface-2" | "surface-raised" | "surface-hover" | "tooltip" | "hover"
  | "line" | "line-strong" | "line-hover"
  | "accent" | "accent-hover" | "accent-text" | "on-accent" | "accent-soft" | "accent-line"
  | "ok" | "red" | "red-soft" | "red-line"
  | "text" | "text-2" | "text-3"
  | "scrim" | "shadow-color";

export const DARK: Record<TokenName, string> = {
  "bg": "#121315",
  "surface": "#18191c",
  "surface-2": "#1e2023",
  "surface-raised": "#222427",
  "surface-hover": "#232528",
  "tooltip": "#26282c",
  "hover": "rgba(255, 255, 255, 0.04)",
  "line": "#26282c",
  "line-strong": "#383b41",
  "line-hover": "#4a4e55",
  "accent": "#e8a33d",
  "accent-hover": "#f0b155",
  "accent-text": "#e8a33d",
  "on-accent": "#1a1408",
  "accent-soft": "rgba(232, 163, 61, 0.09)",
  "accent-line": "rgba(232, 163, 61, 0.5)",
  "ok": "#8fbf96",
  "red": "#f08a7a",
  "red-soft": "rgba(240, 138, 122, 0.1)",
  "red-line": "rgba(240, 138, 122, 0.45)",
  "text": "#ecebe7",
  "text-2": "#a3a39e",
  "text-3": "#8b8b86",
  "scrim": "rgba(8, 8, 9, 0.7)",
  "shadow-color": "rgba(0, 0, 0, 0.5)",
};

export const BEIGE: Record<TokenName, string> = {
  "bg": "#f1ebdf",
  "surface": "#f7f2e8",
  "surface-2": "#e9e1d2",
  "surface-raised": "#fbf8f2",
  "surface-hover": "#e6ddcc",
  "tooltip": "#fbf8f2",
  "hover": "rgba(60, 45, 20, 0.05)",
  "line": "#ddd3c1",
  "line-strong": "#c9bca5",
  "line-hover": "#b5a68c",
  "accent": "#e8a33d",
  "accent-hover": "#db9530",
  "accent-text": "#8f5100",
  "on-accent": "#1a1408",
  "accent-soft": "rgba(232, 163, 61, 0.16)",
  "accent-line": "rgba(143, 81, 0, 0.45)",
  "ok": "#356a3e",
  "red": "#b3261e",
  "red-soft": "rgba(179, 38, 30, 0.08)",
  "red-line": "rgba(179, 38, 30, 0.4)",
  "text": "#231e16",
  "text-2": "#5e5446",
  "text-3": "#675c4d",
  "scrim": "rgba(60, 45, 20, 0.35)",
  "shadow-color": "rgba(70, 50, 20, 0.18)",
};

/** CSS custom-property declarations for a palette, in TokenName order. */
export function cssVars(p: Record<TokenName, string>): string {
  return (Object.keys(DARK) as TokenName[]).map((k) => `--${k}: ${p[k]};`).join(" ");
}

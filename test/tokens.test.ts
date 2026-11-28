import { describe, expect, it } from "vitest";
import { BEIGE, DARK, type TokenName } from "../src/shared/palette";
import { captureStyles } from "../src/content/captureConfig";

const css = import.meta.glob("../src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const TOKENS = "../src/shared/tokens.css";
const PANEL = "../src/sidepanel/index.css";

/** The declarations of the first block whose selector text contains `selector`. */
function block(text: string, selector: string): Record<string, string> {
  const at = text.indexOf(selector);
  if (at < 0) throw new Error(`selector not found: ${selector}`);
  const body = text.slice(text.indexOf("{", at) + 1, text.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.replace(/\s+/g, " ").trim();
  return out;
}

const norm = (p: Record<TokenName, string>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.replace(/\s+/g, " ").trim()]));

describe("tokens.css", () => {
  it("matches the palette", () => {
    const text = css[TOKENS];
    if (text === undefined) throw new Error("tokens.css missing");
    expect(block(text, ":root {")).toEqual(norm(DARK));
    expect(block(text, ':root:not([data-theme="dark"])')).toEqual(norm(BEIGE));
    expect(block(text, ':root[data-theme="light"]')).toEqual(norm(BEIGE));
    expect(text).toContain("color-scheme: dark");
    expect(text.match(/(?<!-)color-scheme: light/g)).toHaveLength(2);
  });

  it("has no colour literals outside tokens.css", () => {
    const hits = Object.entries(css)
      .filter(([file]) => file !== TOKENS)
      .flatMap(([file, text]) =>
        text.split("\n").map((line, i) => ({ file, n: i + 1, line: line.trim() })).filter(({ line }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line)));
    expect(hits).toEqual([]);
  });

  // Every stylesheet, plus the capture box's (built at runtime from captureConfig).
  const sources = () => ({ ...css, "captureStyles()": captureStyles("system") });

  it("uses the accent only as a fill or border, never as text", () => {
    // `color:` on its own; accent-color and border-color are allowed. Text uses --accent-text.
    expect(css[PANEL]).toBeDefined();
    const hits = Object.entries(sources())
      .filter(([, text]) => /(^|[\s;{])color:\s*var\(--accent\)/m.test(text))
      .map(([file]) => file);
    expect(hits).toEqual([]);
  });

  it("focus indication uses --focus, never the bright accent", () => {
    // WCAG 1.4.11: bright amber is under 3:1 on beige surfaces; --focus is 3:1+ in both themes.
    const hits = Object.entries(sources()).flatMap(([file, text]) =>
      [...text.matchAll(/([^{}]*:focus[^{]*)\{([^}]*)\}/g)]
        .filter((m) => m[2]!.includes("var(--accent)"))
        .map((m) => `${file}: ${m[1]!.trim()}`)
    );
    expect(hits).toEqual([]);
  });

  it("lines marking the active task use --accent-text (3:1 on beige), not --accent", () => {
    const panel = css[PANEL] ?? "";
    for (const sel of [".row-active .check {", ".row-active, .row-active:hover {", ".tree:focus .row-active.row-focused {", ".wf-card-active {"]) {
      const at = panel.indexOf(sel);
      expect(at, sel).toBeGreaterThanOrEqual(0);
      expect(panel.slice(at, panel.indexOf("}", at)), sel).not.toContain("var(--accent)");
    }
  });
});

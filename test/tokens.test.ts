import { describe, expect, it } from "vitest";
import { BEIGE, DARK, type TokenName } from "../src/shared/palette";

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

  it("uses the accent only as a fill or border, never as text", () => {
    // `color:` on its own; accent-color and border-color are allowed.
    expect(css[PANEL]).toBeDefined();
    expect(css[PANEL] ?? "").not.toMatch(/(^|[\s;{])color:\s*var\(--accent\)/m);
  });
});

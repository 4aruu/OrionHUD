import { afterEach, describe, expect, it, vi } from "vitest";
import { BEIGE, DARK, TOKEN_NAMES, cssVars, type TokenName } from "../src/shared/palette";
import {
  applyTheme,
  applyThemeChoice,
  onThemePrefChange,
  parseThemePref,
  readThemePref,
  THEME_KEY,
  writeThemePref,
  type ThemePref,
} from "../src/shared/theme";

afterEach(() => vi.unstubAllGlobals());

it("parseThemePref falls back to system", () => {
  expect(parseThemePref("light")).toBe("light");
  expect(parseThemePref("dark")).toBe("dark");
  expect(parseThemePref("system")).toBe("system");
  for (const bad of ["sepia", 42, undefined, null, {}]) expect(parseThemePref(bad)).toBe("system");
});

it("readThemePref reads chrome.storage.local", async () => {
  const get = vi.fn();
  vi.stubGlobal("chrome", { storage: { local: { get } } });
  get.mockResolvedValueOnce({ [THEME_KEY]: "light" });
  expect(await readThemePref()).toBe("light");
  get.mockResolvedValueOnce({});
  expect(await readThemePref()).toBe("system");
  get.mockRejectedValueOnce(new Error("boom"));
  expect(await readThemePref()).toBe("system");
});

it("writeThemePref writes storage and the mirror", async () => {
  const set = vi.fn().mockResolvedValue(undefined);
  const setItem = vi.fn();
  vi.stubGlobal("chrome", { storage: { local: { set } } });
  vi.stubGlobal("localStorage", { setItem });
  await writeThemePref("dark");
  expect(set).toHaveBeenCalledWith({ "orion-theme": "dark" });
  expect(setItem).toHaveBeenCalledWith("orion-theme", "dark");

  vi.stubGlobal("localStorage", { setItem: () => { throw new Error("denied"); } });
  await expect(writeThemePref("light")).resolves.toBeUndefined();
});

/** A stand-in for <html>: just the attribute calls applyTheme makes. */
function stubRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  } as unknown as HTMLElement & { attrs: Map<string, string> };
}

it("applyTheme sets data-theme for light/dark and removes it for system", () => {
  const root = stubRoot();
  applyTheme("light", root);
  expect(root.attrs.get("data-theme")).toBe("light");
  applyTheme("dark", root);
  expect(root.attrs.get("data-theme")).toBe("dark");
  applyTheme("system", root);
  expect(root.attrs.has("data-theme")).toBe(false);
});

describe("applyThemeChoice", () => {
  it("applies the choice and writes it", async () => {
    const apply = vi.fn();
    const write = vi.fn(() => Promise.resolve());
    const onError = vi.fn();
    await applyThemeChoice("light", "dark", { write, apply, onError });
    expect(apply.mock.calls).toEqual([["light"]]);
    expect(write).toHaveBeenCalledWith("light");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reverts to the previous choice and reports when the write fails", async () => {
    const apply = vi.fn();
    const err = new Error("quota");
    const onError = vi.fn();
    await applyThemeChoice("light", "dark", { write: () => Promise.reject(err), apply, onError });
    expect(apply.mock.calls).toEqual([["light"], ["dark"]]);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe("onThemePrefChange", () => {
  type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

  it("reports parsed local changes to the preference and stops after the cleanup", () => {
    const listeners = new Set<Listener>();
    vi.stubGlobal("chrome", {
      storage: { onChanged: { addListener: (l: Listener) => listeners.add(l), removeListener: (l: Listener) => listeners.delete(l) } },
    });
    const seen: ThemePref[] = [];
    const off = onThemePrefChange((p) => seen.push(p));
    const fire = (changes: Record<string, { newValue?: unknown }>, area: string) => listeners.forEach((l) => l(changes, area));
    fire({ [THEME_KEY]: { newValue: "light" } }, "local");
    fire({ [THEME_KEY]: { newValue: "neon" } }, "local");
    fire({ [THEME_KEY]: { newValue: "dark" } }, "sync");
    fire({ other: { newValue: "dark" } }, "local");
    expect(seen).toEqual(["light", "system"]);
    off();
    expect(listeners.size).toBe(0);
  });

  it("is a no-op without chrome.storage", () => {
    vi.stubGlobal("chrome", {});
    expect(() => onThemePrefChange(() => {})()).not.toThrow();
  });
});

describe("palette", () => {
  it("palettes define the same tokens, in TOKEN_NAMES order", () => {
    expect(Object.keys(DARK)).toEqual([...TOKEN_NAMES]);
    expect(Object.keys(BEIGE)).toEqual([...TOKEN_NAMES]);
  });

  it("cssVars lists every token in order", () => {
    const out = cssVars(DARK);
    expect(out.startsWith("--bg: #121315;")).toBe(true);
    expect([...out.matchAll(/--([\w-]+):/g)].map((m) => m[1])).toEqual([...TOKEN_NAMES]);
    expect(cssVars(BEIGE)).toContain("--focus: #8f5100;");
  });
});

type Rgba = [number, number, number, number];
function parse(c: string): Rgba {
  const hex6 = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex6) {
    const n = parseInt(hex6[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (hex3) return [parseInt(hex3[1]! + hex3[1]!, 16), parseInt(hex3[2]! + hex3[2]!, 16), parseInt(hex3[3]! + hex3[3]!, 16), 1];
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c);
  if (!m) throw new Error(`unparseable colour ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

it("the contrast parser reads every colour form the palettes might use", () => {
  expect(parse("#fff")).toEqual([255, 255, 255, 1]);
  expect(parse("#8f5100")).toEqual([143, 81, 0, 1]);
  expect(parse("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
  expect(parse("rgba(1,2,3,0.5)")).toEqual([1, 2, 3, 0.5]);
  expect(() => parse("hsl(0, 0%, 0%)")).toThrow(/unparseable/);
  for (const p of [DARK, BEIGE]) for (const v of Object.values(p)) expect(() => parse(v)).not.toThrow();
});

function over(fg: Rgba, base: Rgba): Rgba {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i]! * a + base[i]! * (1 - a)).concat(1) as Rgba;
}
function luminance([r, g, b]: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg: Rgba, bg: Rgba): number {
  const a = luminance(over(fg, bg));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const PAIRS: Array<[TokenName, TokenName]> = [
  ...(["text", "text-2", "text-3", "accent-text", "red"] as const).flatMap((fg) =>
    (["bg", "surface", "surface-2"] as const).map((bg): [TokenName, TokenName] => [fg, bg]),
  ),
  ["text", "tooltip"], ["text", "surface-raised"], ["text", "surface-hover"],
  ["ok", "surface"], ["ok", "surface-2"],
  ["on-accent", "accent"],
  // .btn-primary:hover
  ["on-accent", "accent-hover"],
  // Welcome's finished-step ✓ (.wstep-done .wstep-num)
  ["bg", "ok"],
];

/** Text on a translucent fill, composited over the surface it sits on. */
const SOFT_PAIRS: Array<{ fg: TokenName; fill: TokenName; base: TokenName; where: string }> = [
  { fg: "accent-text", fill: "accent-soft", base: "surface", where: ".btn-on" },
  { fg: "text", fill: "accent-soft", base: "surface", where: ".chip-on, .row-active" },
  { fg: "red", fill: "red-soft", base: "surface", where: ".btn-danger:hover" },
];

for (const [name, p] of [["dark", DARK], ["beige", BEIGE]] as const) {
  it(`contrast >= 4.5 for used pairs, ${name}`, () => {
    for (const [fg, bg] of PAIRS) {
      expect(contrast(parse(p[fg]), parse(p[bg])), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const { fg, fill, base, where } of SOFT_PAIRS) {
      const bg = over(parse(p[fill]), parse(p[base]));
      expect(contrast(parse(p[fg]), bg), `${fg} on ${fill} over ${base} (${where})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it(`focus ring and state marks >= 3:1 against every surface, ${name}`, () => {
    // WCAG 1.4.11 (non-text contrast): the focus indicator, and the accent-text
    // borders/bars that mark the active task, against what they sit on.
    for (const fg of ["focus", "accent-text"] as const) {
      for (const bg of ["bg", "surface", "surface-2"] as const) {
        expect(contrast(parse(p[fg]), parse(p[bg])), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
      const active = over(parse(p["accent-soft"]), parse(p.surface));
      expect(contrast(parse(p[fg]), active), `${fg} on accent-soft over surface`).toBeGreaterThanOrEqual(3);
    }
  });
}

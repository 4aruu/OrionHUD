import { afterEach, expect, it, vi } from "vitest";
import { BEIGE, DARK, type TokenName } from "../src/shared/palette";
import { parseThemePref, readThemePref, resolveTheme, THEME_KEY, writeThemePref } from "../src/shared/theme";

afterEach(() => vi.unstubAllGlobals());

it("parseThemePref falls back to system", () => {
  expect(parseThemePref("light")).toBe("light");
  expect(parseThemePref("dark")).toBe("dark");
  expect(parseThemePref("system")).toBe("system");
  for (const bad of ["sepia", 42, undefined, null, {}]) expect(parseThemePref(bad)).toBe("system");
});

it("resolveTheme matrix", () => {
  expect(resolveTheme("system", true)).toBe("light");
  expect(resolveTheme("system", false)).toBe("dark");
  expect(resolveTheme("light", false)).toBe("light");
  expect(resolveTheme("dark", true)).toBe("dark");
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

it("palettes define the same tokens", () => {
  expect(Object.keys(DARK)).toEqual(Object.keys(BEIGE));
});

type Rgba = [number, number, number, number];
function parse(c: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(c);
  if (!m) throw new Error(`unparseable colour ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}
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
];

for (const [name, p] of [["dark", DARK], ["beige", BEIGE]] as const) {
  it(`contrast >= 4.5 for used pairs, ${name}`, () => {
    for (const [fg, bg] of PAIRS) {
      expect(contrast(parse(p[fg]), parse(p[bg])), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const soft = over(parse(p["accent-soft"]), parse(p.surface));
    expect(contrast(parse(p["accent-text"]), soft), "accent-text on accent-soft over surface").toBeGreaterThanOrEqual(4.5);
  });
}

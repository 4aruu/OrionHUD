import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

const pngs = import.meta.glob("../icons/*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;

function size(dataUrl: string): [number, number] {
  const bin = atob(dataUrl.split(",")[1]!);
  const u32 = (o: number) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
  return [u32(16), u32(20)]; // IHDR width, height
}

describe("icons", () => {
  it.each([16, 32, 48, 128])("icon%i.png exists at %ipx and is in the manifest", (px) => {
    const url = pngs[`../icons/icon${px}.png`];
    expect(url, `icons/icon${px}.png missing`).toBeDefined();
    expect(size(url!)).toEqual([px, px]);
    expect((manifest.icons as Record<string, string>)[String(px)]).toBe(`icons/icon${px}.png`);
  });
  it("toolbar icon offers 16 and 32", () => {
    expect(manifest.action.default_icon).toMatchObject({ "16": "icons/icon16.png", "32": "icons/icon32.png" });
  });
});

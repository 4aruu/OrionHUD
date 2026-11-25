import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../manifest.json";
import { NOTIFICATION_ICON } from "../src/shared/brand";
import { notify } from "../src/background/notify";

const pngs = import.meta.glob("../icons/*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
// The notification icon is in Vite's publicDir (public/ maps to the dist/ root), not in the manifest.
const publicPngs = import.meta.glob("../public/icons/*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;

function size(dataUrl: string): [number, number] {
  const bin = atob(dataUrl.split(",")[1]!);
  const u32 = (o: number) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
  return [u32(16), u32(20)]; // IHDR width, height
}

function stubNotifications(create: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal("chrome", { notifications: { create }, runtime: { getURL: (path: string) => `chrome-extension://test/${path}` } });
}

describe("icons", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([16, 32, 48, 128])("icon%i.png exists at %ipx and is in the manifest", (px) => {
    const url = pngs[`../icons/icon${px}.png`];
    expect(url, `icons/icon${px}.png missing`).toBeDefined();
    expect(size(url!)).toEqual([px, px]);
    expect((manifest.icons as Record<string, string>)[String(px)]).toBe(`icons/icon${px}.png`);
  });

  it("toolbar icon offers 16 and 32", () => {
    expect(manifest.action.default_icon).toMatchObject({ "16": "icons/icon16.png", "32": "icons/icon32.png" });
  });

  it("notification icon ships from public/ as icons/notify96.png at 96x96", () => {
    expect(NOTIFICATION_ICON).toBe("icons/notify96.png");
    const url = publicPngs[`../public/${NOTIFICATION_ICON}`];
    expect(url, `public/${NOTIFICATION_ICON} missing`).toBeDefined();
    expect(size(url!)).toEqual([96, 96]);
  });

  it("notifications use the full-size icon", async () => {
    const create = vi.fn().mockResolvedValue("id");
    stubNotifications(create);
    await notify("n", "Title", "Body");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith("n", expect.objectContaining({ iconUrl: "chrome-extension://test/icons/notify96.png" }));
  });

  it("notifications retry once with the manifest icon if the first create fails", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("Unable to download all specified images.")).mockResolvedValue("id");
    stubNotifications(create);
    await notify("n", "Title", "Body");
    expect(create.mock.calls.map(([, o]) => o.iconUrl)).toEqual([
      "chrome-extension://test/icons/notify96.png",
      "chrome-extension://test/icons/icon128.png",
    ]);
  });

  it("notify never throws, even if both attempts fail", async () => {
    const create = vi.fn().mockRejectedValue(new Error("notifications unavailable"));
    stubNotifications(create);
    await expect(notify("n", "Title", "Body")).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

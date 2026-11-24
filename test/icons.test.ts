import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../manifest.json";
import { NOTIFICATION_ICON } from "../src/shared/brand";
import { notify } from "../src/background/notify";

const pngs = import.meta.glob("../icons/*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const viteConfig = import.meta.glob("../vite.config.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function size(dataUrl: string): [number, number] {
  const bin = atob(dataUrl.split(",")[1]!);
  const u32 = (o: number) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
  return [u32(16), u32(20)]; // IHDR width, height
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

  it("notification icon is notify96.png at 96x96", () => {
    expect(NOTIFICATION_ICON).toBe("icons/notify96.png");
    const url = pngs[`../${NOTIFICATION_ICON}`];
    expect(url, `${NOTIFICATION_ICON} missing`).toBeDefined();
    expect(size(url!)).toEqual([96, 96]);
  });

  it("notifications use the full-size icon", async () => {
    const create = vi.fn().mockResolvedValue("id");
    vi.stubGlobal("chrome", {
      notifications: { create },
      runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    });
    await notify("n", "Title", "Body");
    expect(create).toHaveBeenCalledWith("n", expect.objectContaining({ iconUrl: "chrome-extension://test/icons/notify96.png" }));
  });

  it("the build ships the notification icon at the same path", () => {
    // Not referenced by the manifest, so crxjs won't copy it; vite.config.ts emits it.
    expect(viteConfig["../vite.config.ts"]).toContain(`const NOTIFICATION_ICON = "${NOTIFICATION_ICON}";`);
    expect(viteConfig["../vite.config.ts"]).toContain("notificationIcon(),");
  });
});

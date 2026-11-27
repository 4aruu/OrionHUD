import { afterEach, beforeEach, expect, it, vi } from "vitest";

const createMenus = vi.fn();
const ensureLiveTabsAlarm = vi.fn(async () => undefined);
vi.mock("../src/background/menus", () => ({ createMenus }));
vi.mock("../src/background/idle", () => ({ ensureLiveTabsAlarm }));

const tabsCreate = vi.fn(async () => undefined);

beforeEach(() => {
  vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => p }, tabs: { create: tabsCreate } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("install opens the welcome tab once", async () => {
  const { onInstalled } = await import("../src/background/install");
  await onInstalled({ reason: "install" });
  expect(tabsCreate).toHaveBeenCalledTimes(1);
  expect(tabsCreate).toHaveBeenCalledWith({ url: "src/welcome/index.html" });
});

it("update, chrome_update and shared_module_update open nothing", async () => {
  const { onInstalled } = await import("../src/background/install");
  for (const reason of ["update", "chrome_update", "shared_module_update"]) await onInstalled({ reason });
  expect(tabsCreate).not.toHaveBeenCalled();
});

it("menus and alarm are set up for every reason", async () => {
  const { onInstalled } = await import("../src/background/install");
  for (const reason of ["install", "update", "chrome_update", "shared_module_update"]) {
    createMenus.mockClear();
    ensureLiveTabsAlarm.mockClear();
    await onInstalled({ reason });
    expect(createMenus).toHaveBeenCalledTimes(1);
    expect(ensureLiveTabsAlarm).toHaveBeenCalledTimes(1);
  }
});

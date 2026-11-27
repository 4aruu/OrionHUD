import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { createMenus, ensureLiveTabsAlarm, tabsCreate } = vi.hoisted(() => ({
  createMenus: vi.fn(),
  ensureLiveTabsAlarm: vi.fn(async (): Promise<void> => undefined),
  tabsCreate: vi.fn(async (_opts: { url: string }): Promise<void> => undefined),
}));
vi.mock("../src/background/menus", () => ({ createMenus }));
vi.mock("../src/background/idle", () => ({ ensureLiveTabsAlarm }));

import { onInstalled } from "../src/background/install";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => p }, tabs: { create: tabsCreate } });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("install opens the welcome tab once", async () => {
  await onInstalled({ reason: "install" });
  expect(tabsCreate).toHaveBeenCalledTimes(1);
  expect(tabsCreate).toHaveBeenCalledWith({ url: "src/welcome/index.html" });
  expect(consoleError).not.toHaveBeenCalled();
});

it("update, chrome_update and shared_module_update open nothing", async () => {
  for (const reason of ["update", "chrome_update", "shared_module_update"]) await onInstalled({ reason });
  expect(tabsCreate).not.toHaveBeenCalled();
});

it("menus and alarm are set up for every reason", async () => {
  for (const reason of ["install", "update", "chrome_update", "shared_module_update"]) {
    createMenus.mockClear();
    ensureLiveTabsAlarm.mockClear();
    await onInstalled({ reason });
    expect(createMenus).toHaveBeenCalledTimes(1);
    expect(ensureLiveTabsAlarm).toHaveBeenCalledTimes(1);
  }
});

it("a failing alarm setup still opens the welcome tab and is logged", async () => {
  ensureLiveTabsAlarm.mockRejectedValueOnce(new Error("alarm boom"));
  await expect(onInstalled({ reason: "install" })).resolves.toBeUndefined();
  expect(tabsCreate).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(consoleError.mock.calls[0][0]).toContain("live-tabs alarm");
});

it("a failing tabs.create is caught and logged, menus and alarm still set up", async () => {
  tabsCreate.mockRejectedValueOnce(new Error("tab boom"));
  await expect(onInstalled({ reason: "install" })).resolves.toBeUndefined();
  expect(createMenus).toHaveBeenCalledTimes(1);
  expect(ensureLiveTabsAlarm).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(consoleError.mock.calls[0][0]).toContain("welcome tab");
});

it("a throwing createMenus is logged and does not block the rest", async () => {
  createMenus.mockImplementationOnce(() => {
    throw new Error("menu boom");
  });
  await expect(onInstalled({ reason: "install" })).resolves.toBeUndefined();
  expect(ensureLiveTabsAlarm).toHaveBeenCalledTimes(1);
  expect(tabsCreate).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledTimes(1);
});

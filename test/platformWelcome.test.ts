import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onPinnedChange, readPinned } from "../src/platform/action";
import { getShortcut } from "../src/platform/commands";
import { showWelcomeTab } from "../src/platform/welcome";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

describe("readPinned", () => {
  it("is null when the API is missing", async () => {
    vi.stubGlobal("chrome", { action: {} });
    expect(await readPinned()).toBeNull();
  });
  it("reports isOnToolbar", async () => {
    vi.stubGlobal("chrome", { action: { getUserSettings: vi.fn(() => Promise.resolve({ isOnToolbar: true })) } });
    expect(await readPinned()).toBe(true);
  });
  it("is null when it throws", async () => {
    vi.stubGlobal("chrome", { action: { getUserSettings: vi.fn(() => Promise.reject(new Error("nope"))) } });
    expect(await readPinned()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[Orion Waypoint]"), expect.any(Error));
  });
});

describe("onPinnedChange", () => {
  it("is a no-op without the event", () => {
    vi.stubGlobal("chrome", { action: {} });
    expect(() => onPinnedChange(() => {})()).not.toThrow();
  });
  it("is a no-op when chrome.action is undefined", () => {
    vi.stubGlobal("chrome", {});
    let off: () => void = () => {};
    expect(() => {
      off = onPinnedChange(() => {});
    }).not.toThrow();
    expect(() => off()).not.toThrow();
  });
  it("subscribes and unsubscribes", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    vi.stubGlobal("chrome", { action: { onUserSettingsChanged: { addListener, removeListener } } });
    const cb = vi.fn();
    const off = onPinnedChange(cb);
    expect(addListener).toHaveBeenCalledTimes(1);
    const registered = addListener.mock.calls[0]?.[0];
    registered();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(removeListener).toHaveBeenCalledWith(registered);
  });
});

describe("getShortcut", () => {
  const stub = (cmds: unknown) => vi.stubGlobal("chrome", { commands: { getAll: vi.fn(() => Promise.resolve(cmds)) } });
  it("returns the shortcut", async () => {
    stub([{ name: "save-point", shortcut: "Alt+Shift+S" }]);
    expect(await getShortcut("save-point")).toBe("Alt+Shift+S");
  });
  it("is null for an empty shortcut", async () => {
    stub([{ name: "save-point", shortcut: "" }]);
    expect(await getShortcut("save-point")).toBeNull();
  });
  it("is null for a missing command", async () => {
    stub([{ name: "other", shortcut: "Alt+O" }]);
    expect(await getShortcut("save-point")).toBeNull();
  });
  it("is null when getAll throws", async () => {
    vi.stubGlobal("chrome", { commands: { getAll: vi.fn(() => Promise.reject(new Error("x"))) } });
    expect(await getShortcut("save-point")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[Orion Waypoint]"), expect.any(Error));
  });
});

describe("showWelcomeTab", () => {
  const URL = "chrome-extension://orion/src/welcome/index.html";
  function stub(contexts: unknown) {
    const api = {
      runtime: { getURL: (p: string) => `chrome-extension://orion/${p}`, getContexts: vi.fn(() => Promise.resolve(contexts)) },
      tabs: { create: vi.fn(() => Promise.resolve({})), update: vi.fn(() => Promise.resolve({})) },
      windows: { update: vi.fn(() => Promise.resolve({})) },
    };
    vi.stubGlobal("chrome", api);
    return api;
  }

  it("focuses the welcome tab that is already open", async () => {
    const api = stub([{ contextType: "TAB", tabId: 12, windowId: 3, documentUrl: URL }]);
    await showWelcomeTab();
    expect(api.runtime.getContexts).toHaveBeenCalledWith({ contextTypes: ["TAB"], documentUrls: [URL] });
    expect(api.tabs.update).toHaveBeenCalledWith(12, { active: true });
    expect(api.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });

  it("opens a new tab when none is open", async () => {
    const api = stub([]);
    await showWelcomeTab();
    expect(api.tabs.create).toHaveBeenCalledWith({ url: URL });
    expect(api.tabs.update).not.toHaveBeenCalled();
  });

  it("opens a new tab when getContexts is missing (feature-detected)", async () => {
    const api = stub([]);
    delete (api.runtime as { getContexts?: unknown }).getContexts;
    await showWelcomeTab();
    expect(api.tabs.create).toHaveBeenCalledWith({ url: URL });
  });

  it("opens a new tab, with a warning, when getContexts fails", async () => {
    const api = stub([]);
    api.runtime.getContexts.mockImplementation(() => Promise.reject(new Error("nope")));
    await showWelcomeTab();
    expect(api.tabs.create).toHaveBeenCalledWith({ url: URL });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[Orion Waypoint]"), expect.any(Error));
  });

  it("rejects when the tab can't be opened, so the caller can toast", async () => {
    const api = stub([]);
    api.tabs.create.mockImplementation(() => Promise.reject(new Error("closed")));
    await expect(showWelcomeTab()).rejects.toThrow("closed");
  });
});

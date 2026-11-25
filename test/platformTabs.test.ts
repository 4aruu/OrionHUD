import { afterEach, describe, expect, it, vi } from "vitest";
import { activeNormalTab, restoreTabs } from "../src/platform/tabs";
import type { ISavedTab } from "../src/shared/types";

// In window mode the Orion window can be the "current"/last-focused window, so tab work
// must always target the user's normal browser window.
afterEach(() => vi.unstubAllGlobals());

const saved = (url: string): ISavedTab => ({ url, title: url, kind: "page", vendor: null });

describe("platform/tabs across browsers", () => {
  it("reopens tabs in the last normal window and groups them there", async () => {
    const getLastFocused = vi.fn(async () => ({ id: 7 }) as chrome.windows.Window);
    const created: chrome.tabs.CreateProperties[] = [];
    const group = vi.fn(async () => 3);
    vi.stubGlobal("chrome", {
      windows: { getLastFocused, update: vi.fn(async () => ({})) },
      tabs: { create: vi.fn(async (p: chrome.tabs.CreateProperties) => (created.push(p), { id: created.length })), group },
      tabGroups: { update: vi.fn(async () => ({})) },
    });
    const n = await restoreTabs([saved("https://example.com/a"), saved("https://example.com/b")], "Write retry test");
    expect(n).toBe(2);
    expect(getLastFocused).toHaveBeenCalledWith({ windowTypes: ["normal"] });
    expect(created.map((p) => p.windowId)).toEqual([7, 7]);
    expect(group).toHaveBeenCalledWith({ tabIds: [1, 2], createProperties: { windowId: 7 } });
  });

  it("reopens tabs even when there is no normal window to target", async () => {
    const create = vi.fn(async () => ({ id: 1 }));
    vi.stubGlobal("chrome", {
      windows: { getLastFocused: vi.fn(async () => Promise.reject(new Error("No last-focused window"))) },
      tabs: { create, group: vi.fn(async () => Promise.reject(new Error("no groups"))) },
    });
    expect(await restoreTabs([saved("https://example.com/a")], "T")).toBe(1);
  });

  it("opens a browser window for the tabs when only the Orion window is open", async () => {
    const created: chrome.tabs.CreateProperties[] = [];
    const winCreate = vi.fn(async () => ({ id: 5, tabs: [{ id: 11 }] }) as chrome.windows.Window);
    vi.stubGlobal("chrome", {
      windows: { getLastFocused: vi.fn(async () => Promise.reject(new Error("No last-focused window"))), create: winCreate, update: vi.fn(async () => ({})) },
      tabs: { create: vi.fn(async (p: chrome.tabs.CreateProperties) => (created.push(p), { id: 12 })), group: vi.fn(async () => 3) },
      tabGroups: { update: vi.fn(async () => ({})) },
    });
    expect(await restoreTabs([saved("https://example.com/a"), saved("https://example.com/b")], "T")).toBe(2);
    expect(winCreate).toHaveBeenCalledWith({ url: "https://example.com/a", focused: true });
    expect(created).toEqual([{ url: "https://example.com/b", active: false, windowId: 5 }]);
  });

  it("reads the active tab of the last normal window, never the Orion window", async () => {
    const getLastFocused = vi.fn(async () => ({ id: 9 }) as chrome.windows.Window);
    const query = vi.fn(async () => [{ id: 4, url: "https://docs.example.com" }]);
    vi.stubGlobal("chrome", { windows: { getLastFocused }, tabs: { query } });
    expect((await activeNormalTab())?.url).toBe("https://docs.example.com");
    expect(getLastFocused).toHaveBeenCalledWith({ windowTypes: ["normal"] });
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 9 });
  });
});

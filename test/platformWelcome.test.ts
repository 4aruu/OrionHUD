import { afterEach, describe, expect, it, vi } from "vitest";
import { onPinnedChange, readPinned } from "../src/platform/action";
import { getShortcut } from "../src/platform/commands";

afterEach(() => vi.unstubAllGlobals());

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
  });
});

describe("onPinnedChange", () => {
  it("is a no-op without the event", () => {
    vi.stubGlobal("chrome", { action: {} });
    expect(() => onPinnedChange(() => {})()).not.toThrow();
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
  });
});

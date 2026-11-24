import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../manifest.json";
import { COMMAND_WINDOW, PANEL_PAGE, PANEL_WINDOW, initSurface, onActionClicked, openPanelWindow } from "../src/background/surface";

// Minimal chrome stub: in-memory storage.session plus the window calls surface.ts makes.
function stubChrome(opts: { sidePanel?: "ok" | "reject" | "absent"; anchor?: Partial<chrome.windows.Window> | null } = {}) {
  const session: Record<string, unknown> = {};
  const open = new Set<number>();
  let nextId = 100;
  const setPanelBehavior = vi.fn(() => (opts.sidePanel === "reject" ? Promise.reject(new Error("unsupported")) : Promise.resolve()));
  const create = vi.fn(async (data: chrome.windows.CreateData) => {
    const id = nextId++;
    open.add(id);
    return { id, ...data } as chrome.windows.Window;
  });
  const update = vi.fn(async (id: number) => {
    if (!open.has(id)) throw new Error(`No window with id: ${id}.`);
    return { id } as chrome.windows.Window;
  });
  const getLastFocused = vi.fn(async () => {
    if (opts.anchor === null) throw new Error("No last-focused window");
    return { id: 1, state: "normal", left: 0, top: 40, width: 1600, ...opts.anchor } as chrome.windows.Window;
  });
  vi.stubGlobal("chrome", {
    ...(opts.sidePanel === "absent" ? {} : { sidePanel: { setPanelBehavior } }),
    runtime: { getURL: (p: string) => `chrome-extension://orion/${p}` },
    storage: {
      session: {
        get: async (key: string) => (key in session ? { [key]: session[key] } : {}),
        set: async (items: Record<string, unknown>) => void Object.assign(session, items),
      },
    },
    windows: { create, update, getLastFocused },
  });
  return { setPanelBehavior, create, update, getLastFocused, open };
}

describe("surface", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("uses the side panel where the browser has one", async () => {
    const c = stubChrome({ sidePanel: "ok" });
    expect(await initSurface()).toBe("panel");
    expect(c.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it("falls back to a window when the side panel API is missing (Arc)", async () => {
    stubChrome({ sidePanel: "absent" });
    expect(await initSurface()).toBe("window");
  });

  it("falls back to a window when the side panel call fails", async () => {
    stubChrome({ sidePanel: "reject" });
    expect(await initSurface()).toBe("window");
  });

  it("a toolbar click opens nothing extra in panel mode, and the window in window mode", async () => {
    const panel = stubChrome({ sidePanel: "ok" });
    await initSurface();
    await onActionClicked();
    expect(panel.create).not.toHaveBeenCalled();

    const win = stubChrome({ sidePanel: "absent" });
    await initSurface();
    await onActionClicked();
    expect(win.create).toHaveBeenCalledTimes(1);
  });

  it("opens one panel window at the right edge, then focuses it instead of opening another", async () => {
    const c = stubChrome({ sidePanel: "absent" });
    await openPanelWindow();
    expect(c.create).toHaveBeenCalledWith({
      url: `chrome-extension://orion/${PANEL_PAGE}`,
      type: "popup",
      width: PANEL_WINDOW.width,
      height: PANEL_WINDOW.height,
      focused: true,
      left: 1600 - PANEL_WINDOW.width,
      top: 40,
    });
    await openPanelWindow();
    expect(c.create).toHaveBeenCalledTimes(1);
    expect(c.update).toHaveBeenLastCalledWith(100, { focused: true });
  });

  it("opens a new window when the user closed the previous one", async () => {
    const c = stubChrome({ sidePanel: "absent" });
    await openPanelWindow();
    c.open.clear();
    await openPanelWindow();
    expect(c.create).toHaveBeenCalledTimes(2);
  });

  it("still opens when there is no normal window to anchor to", async () => {
    const c = stubChrome({ sidePanel: "absent", anchor: null });
    await openPanelWindow();
    const [data] = c.create.mock.calls[0]!;
    expect(data).not.toHaveProperty("left");
  });

  it("opens the same page the manifest declares, and the shortcut is declared", () => {
    expect(PANEL_PAGE).toBe(manifest.side_panel.default_path);
    expect((manifest.commands as Record<string, { suggested_key?: { default: string } }>)[COMMAND_WINDOW]?.suggested_key?.default).toBe("Alt+Shift+O");
  });
});

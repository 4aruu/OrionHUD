import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onOpenPanelWindowMessage } from "../src/background/surface";

const ID = "orion";
const WELCOME_URL = `chrome-extension://${ID}/src/welcome/index.html`;
const MSG = { type: "ORION_OPEN_PANEL_WINDOW" };

describe("ORION_OPEN_PANEL_WINDOW routing (security gate)", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", { runtime: { id: ID, getURL: (p: string) => `chrome-extension://${ID}/${p}` } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the panel window for the welcome page", async () => {
    const open = vi.fn(() => Promise.resolve());
    const respond = vi.fn();
    expect(onOpenPanelWindowMessage(MSG, { id: ID, url: `${WELCOME_URL}?x` }, respond, open)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
  });

  it("ignores our own content script on a web page", () => {
    const open = vi.fn(() => Promise.resolve());
    const sender = { id: ID, url: "https://example.com/", tab: { id: 3 } as chrome.tabs.Tab };
    expect(onOpenPanelWindowMessage(MSG, sender, vi.fn(), open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores other extension pages, other extensions, and other messages", () => {
    const open = vi.fn(() => Promise.resolve());
    expect(onOpenPanelWindowMessage(MSG, { id: ID, url: `chrome-extension://${ID}/src/sidepanel/index.html` }, vi.fn(), open)).toBe(false);
    expect(onOpenPanelWindowMessage(MSG, { id: "other", url: WELCOME_URL }, vi.fn(), open)).toBe(false);
    expect(onOpenPanelWindowMessage(MSG, { id: ID }, vi.fn(), open)).toBe(false);
    expect(onOpenPanelWindowMessage({ ...MSG, extra: 1 }, { id: ID, url: WELCOME_URL }, vi.fn(), open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("reports a failed open", async () => {
    const respond = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    onOpenPanelWindowMessage(MSG, { id: ID, url: WELCOME_URL }, respond, () => Promise.reject(new Error("no window")));
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false }));
  });
});

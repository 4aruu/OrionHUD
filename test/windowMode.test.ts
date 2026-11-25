import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask, makeWorkflow } from "./fixtures";

// Window mode puts Orion in its own browser window. These handlers must keep
// treating the user's normal browser window as "where they are".
const ctx = vi.hoisted(() => ({ getActiveContext: vi.fn() }));
const notifier = vi.hoisted(() => ({ notify: vi.fn(async (_id: string, _title: string, _message: string) => undefined), broadcast: vi.fn() }));
const tabsMod = vi.hoisted(() => ({ activeNormalTab: vi.fn() }));
const surfaceMod = vi.hoisted(() => ({ openPanelWindow: vi.fn(async () => undefined) }));
vi.mock("../src/background/context", () => ctx);
vi.mock("../src/background/notify", () => notifier);
vi.mock("../src/platform/tabs", () => tabsMod);
vi.mock("../src/background/surface", () => surfaceMod);

import { handleTaskAlarm } from "../src/background/timesUp";
import { handleTabChange } from "../src/background/guard";
import { onMenuClicked } from "../src/background/menus";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => `chrome-extension://orion/${p}` } });
});
afterEach(() => vi.unstubAllGlobals());

describe("window mode", () => {
  it("time's up judges drift from the user's browser tab, not the Orion window", async () => {
    const task = makeTask("t1", [], { status: "ACTIVE", targetUrl: "https://docs.example.com" });
    ctx.getActiveContext.mockResolvedValue({ workflow: makeWorkflow([task]), meta: {} });
    tabsMod.activeNormalTab.mockResolvedValue({ url: "https://docs.example.com/guide" });
    await handleTaskAlarm({ name: "orion-task:t1", scheduledTime: 0 } as chrome.alarms.Alarm);
    expect(tabsMod.activeNormalTab).toHaveBeenCalled();
    const [, , message] = notifier.notify.mock.calls[0]!;
    expect(message).not.toContain("drifted");
  });

  it("focusing the Orion window never resets the distraction timer", async () => {
    await handleTabChange("chrome-extension://orion/src/sidepanel/index.html");
    expect(ctx.getActiveContext).not.toHaveBeenCalled();
  });

  it("right-click toolbar icon → Open in its own window opens the panel window", () => {
    onMenuClicked({ menuItemId: "orion-open-window" } as chrome.contextMenus.OnClickData);
    expect(surfaceMod.openPanelWindow).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, expect, it, vi } from "vitest";

// A browser without chrome.sidePanel and chrome.idle (Arc lacks the side panel) must still
// get every other feature: the worker may not throw while registering its listeners.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("the service worker starts when the side panel and idle APIs are missing", async () => {
  const event = () => ({ addListener: vi.fn() });
  const chromeStub = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event(), getURL: (p: string) => p, id: "orion" },
    alarms: { onAlarm: event() },
    commands: { onCommand: event() },
    contextMenus: { onClicked: event() },
    tabs: { onActivated: event(), onUpdated: event() },
    action: { onClicked: event() },
    storage: { session: { get: async () => ({}), set: async () => undefined } },
  };
  vi.stubGlobal("chrome", chromeStub);
  await expect(import("../src/background/index")).resolves.toBeDefined();
  expect(chromeStub.action.onClicked.addListener).toHaveBeenCalledTimes(1);
  expect(chromeStub.commands.onCommand.addListener).toHaveBeenCalledTimes(1);
});

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onCommand, onRuntimeMessage } from "../src/background/capture";
import { addTask, createWorkflow, startWorkflow } from "../src/shared/workflowActions";
import { getWorkflow } from "../src/shared/db";

const OWN_ID = "orion-test-id";
const OWN_ORIGIN = `chrome-extension://${OWN_ID}/`;

function installChrome(storedTheme: unknown = "light") {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: OWN_ID, sendMessage: vi.fn(() => Promise.resolve()), getURL: (p: string) => OWN_ORIGIN + p },
    scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    storage: { local: { get: vi.fn(() => Promise.resolve({ "orion-theme": storedTheme })) } },
    notifications: { create: vi.fn(() => Promise.resolve("id")) },
    alarms: { create: vi.fn(), clear: vi.fn() },
    permissions: { contains: vi.fn(() => Promise.resolve(false)) },
  };
}

type MockChrome = {
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  notifications: { create: ReturnType<typeof vi.fn> };
};
const mockChrome = () => (globalThis as unknown as { chrome: MockChrome }).chrome;

async function startTask(workflowName: string, taskTitle: string): Promise<{ wfId: string; taskId: string }> {
  const wf = await createWorkflow(workflowName, 5);
  const t = await addTask(wf.id, null, taskTitle);
  await startWorkflow(wf.id, t.id);
  return { wfId: wf.id, taskId: t.id };
}

const tab = { id: 7, url: "https://github.com/acme/repo/issues/9", title: "Issue 9" } as chrome.tabs.Tab;
const inboxMsg = { type: "ORION_CAPTURE_SUBMIT", mode: "inbox", text: "check rate limits" };

function call(raw: unknown, sender: chrome.runtime.MessageSender) {
  return new Promise<{ handled: boolean; response: unknown }>((resolve) => {
    let handled = false;
    handled = onRuntimeMessage(raw, sender, (r) => resolve({ handled, response: r }));
    if (!handled) resolve({ handled, response: undefined });
  });
}

describe("capture message router (security boundary)", () => {
  let wfId: string;

  beforeEach(async () => {
    installChrome();
    wfId = (await startTask("Router", "T")).wfId;
  });

  it("ignores messages from another extension", async () => {
    const r = await call(inboxMsg, { id: "evil-extension", tab });
    expect(r.handled).toBe(false);
    expect((await getWorkflow(wfId))?.inbox).toEqual([]);
  });

  it("ignores capture submissions that don't come from a tab", async () => {
    const r = await call(inboxMsg, { id: OWN_ID });
    expect(r.handled).toBe(false);
  });

  it("ignores malformed payloads", async () => {
    const r = await call({ type: "ORION_CAPTURE_SUBMIT", mode: "inbox", text: "x".repeat(600) }, { id: OWN_ID, tab });
    expect(r.handled).toBe(false);
  });

  it("stores a valid inbox capture with the tab URL as source", async () => {
    const r = await call(inboxMsg, { id: OWN_ID, tab });
    expect(r).toEqual({ handled: true, response: { ok: true } });
    const inbox = (await getWorkflow(wfId))?.inbox ?? [];
    expect(inbox[0]).toMatchObject({ text: "check rate limits", sourceUrl: "https://github.com/acme/repo/issues/9" });
  });

  it("drops an unsafe source URL but keeps the capture", async () => {
    await call(inboxMsg, { id: OWN_ID, tab: { ...tab, url: "javascript:alert(1)" } });
    expect((await getWorkflow(wfId))?.inbox[0]?.sourceUrl).toBeNull();
  });
});

describe("capture box theme hand-off", () => {
  beforeEach(async () => {
    installChrome();
    await startTask("Theme", "Task");
  });

  it("passes the stored theme into the injected config", async () => {
    onCommand("save-point", tab);
    const exec = mockChrome().scripting.executeScript;
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
    expect(exec.mock.calls[0]?.[0].args).toEqual(["save", "Save point · Task", "light"]);
  });

  it("an unknown stored theme is handed over as system", async () => {
    installChrome("neon");
    onCommand("save-point", tab);
    const exec = mockChrome().scripting.executeScript;
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
    expect(exec.mock.calls[0]?.[0].args).toEqual(["save", "Save point · Task", "system"]);
  });
});

describe("save shortcut on a page that can't be scripted", () => {
  let ids: { wfId: string; taskId: string };

  beforeEach(async () => {
    installChrome();
    mockChrome().scripting.executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
    ids = await startTask("Unscriptable", "U");
  });

  async function savePoints() {
    const wf = await getWorkflow(ids.wfId);
    return wf?.rootNodes.find((n) => n.id === ids.taskId)?.savePoints ?? [];
  }

  it("records a save point and asks for a next step on a browser page", async () => {
    onCommand("save-point", { id: 3, url: "chrome://settings/" } as chrome.tabs.Tab);
    const create = mockChrome().notifications.create;
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[1].message).toContain("Add a next step");
    expect(await savePoints()).toHaveLength(1);
  });

  it("on our own page (the welcome tab) records the save point without the notification", async () => {
    onCommand("save-point", { id: 4, url: `${OWN_ORIGIN}src/welcome/index.html` } as chrome.tabs.Tab);
    await vi.waitFor(async () => expect(await savePoints()).toHaveLength(1));
    // The notification would follow the write; give it a moment to (not) happen.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockChrome().notifications.create).not.toHaveBeenCalled();
  });
});

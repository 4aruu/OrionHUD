import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRuntimeMessage } from "../src/background/capture";
import { addTask, createWorkflow, startWorkflow } from "../src/shared/workflowActions";
import { getWorkflow } from "../src/shared/db";

const OWN_ID = "orion-test-id";

function installChrome() {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: OWN_ID, sendMessage: vi.fn(() => Promise.resolve()) },
    alarms: { create: vi.fn(), clear: vi.fn() },
    permissions: { contains: vi.fn(() => Promise.resolve(false)) },
  };
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
    const wf = await createWorkflow("Router", 5);
    const t = await addTask(wf.id, null, "T");
    await startWorkflow(wf.id, t.id);
    wfId = wf.id;
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

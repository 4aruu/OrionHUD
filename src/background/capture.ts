// Keyboard shortcuts + the in-page capture box, and the handler for what the
// box submits. The box is injected only into the tab the user pressed the
// shortcut on (activeTab grant), never auto-injected anywhere.

import { APP_NAME } from "../shared/brand";
import { readThemePref } from "../shared/theme";
import { parseExtensionMessage, isOwnSender, type CaptureMode } from "../shared/messages";
import { addInboxItem, recordSavePoint } from "../shared/workflowActions";
import { captureTabs } from "../platform/tabs";
import { getActiveContext } from "./context";
import { broadcast, notify } from "./notify";

// Built separately by vite.capture.config.ts into dist/capture.js.
const captureScript = "capture.js";

export const COMMAND_SAVE = "save-point";
export const COMMAND_CAPTURE = "quick-capture";

async function openCaptureBox(mode: CaptureMode, tab: chrome.tabs.Tab | undefined): Promise<void> {
  const { workflow, task } = await getActiveContext();
  if (!workflow) {
    await notify("orion-no-workflow", APP_NAME, `Start a workflow in ${APP_NAME} first.`);
    return;
  }
  if (mode === "save" && !task) {
    await notify("orion-no-task", APP_NAME, `No active task to save. Pick one in ${APP_NAME}.`);
    return;
  }
  const label = mode === "save" ? `Save point · ${task?.title ?? ""}` : `Inbox · ${workflow.name}`;
  if (tab?.id === undefined) return;
  const theme = await readThemePref();
  try {
    // Runs in the extension's isolated world, invisible to the page.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m: string, l: string, t: string) => {
        (globalThis as unknown as { __orionCapture?: unknown }).__orionCapture = { mode: m, label: l, theme: t };
      },
      args: [mode, label.slice(0, 120), theme],
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [captureScript] });
  } catch {
    // chrome://, the Web Store, PDFs, etc. can't be scripted. For a save
    // point we can still record one without a next step.
    if (mode === "save" && task) {
      const tabs = await captureTabs(task.title, tab);
      await recordSavePoint(workflow.id, task.id, { trigger: "manual", ...tabs });
      broadcast("command");
      await notify("orion-saved", "Save point recorded", `“${task.title}”. Add a next step in ${APP_NAME}.`);
    } else {
      await notify("orion-blocked", APP_NAME, `Your browser doesn't allow extensions on this page. Open ${APP_NAME} instead.`);
    }
  }
}

export function onCommand(command: string, tab?: chrome.tabs.Tab): void {
  if (command === COMMAND_SAVE) void openCaptureBox("save", tab);
  else if (command === COMMAND_CAPTURE) void openCaptureBox("inbox", tab);
}

type Respond = (r: { ok: true } | { ok: false; error: string }) => void;

async function handleCaptureSubmit(mode: CaptureMode, text: string, tab: chrome.tabs.Tab | undefined): Promise<void> {
  const { workflow, task } = await getActiveContext();
  if (!workflow) throw new Error("No active workflow.");
  if (mode === "save") {
    if (!task) throw new Error("No active task.");
    const tabs = await captureTabs(task.title, tab);
    await recordSavePoint(workflow.id, task.id, { trigger: "manual", nextStep: text, ...tabs });
  } else {
    await addInboxItem(workflow.id, text, task?.id ?? null, tab?.url ?? null);
  }
  broadcast("capture");
}

/** chrome.runtime.onMessage listener for messages from the capture box. */
export function onRuntimeMessage(raw: unknown, sender: chrome.runtime.MessageSender, respond: Respond): boolean {
  if (!isOwnSender(sender, chrome.runtime.id)) return false;
  const msg = parseExtensionMessage(raw);
  if (!msg || msg.type !== "ORION_CAPTURE_SUBMIT") return false;
  // Capture submissions must come from a tab we injected into, not from an extension page.
  if (!sender.tab) return false;
  handleCaptureSubmit(msg.mode, msg.text, sender.tab)
    .then(() => respond({ ok: true }))
    .catch((err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : "Couldn't save." }));
  return true; // async response
}

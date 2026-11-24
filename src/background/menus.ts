// Right-click a text selection on any page → pin it as a decision on the
// active task, or drop it in the inbox. contextMenus hands us selectionText
// directly, so no host permission or content script is needed.

import { APP_NAME } from "../shared/brand";
import { addInboxItem, addNote } from "../shared/workflowActions";
import { LIMITS } from "../shared/validators";
import { getActiveContext } from "./context";
import { broadcast, notify } from "./notify";
import { openPanelWindow } from "./surface";

const MENU_DECISION = "orion-pin-decision";
const MENU_INBOX = "orion-to-inbox";
const MENU_WINDOW = "orion-open-window";

export function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_DECISION, title: "Pin as a decision", contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU_INBOX, title: "Send to inbox", contexts: ["selection"] });
    // Right-click the toolbar icon. Works in every browser, including where the side panel is missing.
    chrome.contextMenus.create({ id: MENU_WINDOW, title: "Open in its own window", contexts: ["action"] });
  });
}

function clip(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > LIMITS.noteContent ? `${t.slice(0, LIMITS.noteContent - 1)}…` : t;
}

async function handle(info: chrome.contextMenus.OnClickData): Promise<void> {
  const text = clip(info.selectionText ?? "");
  if (!text) return;
  const { workflow, task } = await getActiveContext();
  if (!workflow) {
    await notify("orion-menu", APP_NAME, "Start a workflow first, then pin decisions to it.");
    return;
  }
  const source = info.pageUrl ?? null;
  try {
    if (info.menuItemId === MENU_DECISION && task) {
      await addNote(workflow.id, task.id, text, "decision", source);
      await notify("orion-menu", "Decision pinned", `On “${task.title}”`);
    } else {
      await addInboxItem(workflow.id, text, task?.id ?? null, source);
      const why = info.menuItemId === MENU_DECISION ? " (no active task, so it went to the inbox)" : "";
      await notify("orion-menu", "Added to inbox", `${workflow.name}${why}`);
    }
    broadcast("menu");
  } catch (err) {
    await notify("orion-menu", APP_NAME, err instanceof Error ? err.message : "Couldn't save that.");
  }
}

export function onMenuClicked(info: chrome.contextMenus.OnClickData): void {
  if (info.menuItemId === MENU_WINDOW) void openPanelWindow();
  else if (info.menuItemId === MENU_DECISION || info.menuItemId === MENU_INBOX) void handle(info);
}

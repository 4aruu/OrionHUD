import type { ExtensionMessage, StateChangeReason } from "../shared/messages";

/** Tells any open side panel to reload from storage. Safe if none is open. */
export function broadcast(reason: StateChangeReason): void {
  const msg: ExtensionMessage = { type: "ORION_STATE_CHANGED", reason };
  chrome.runtime.sendMessage(msg).catch(() => {
    // No side panel open; it reads from storage when it opens.
  });
}

export async function notify(id: string, title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message: message.slice(0, 300),
    });
  } catch {
    // Notifications disabled at the OS level. Nothing else to do.
  }
}

/** Toolbar badge hinting that a resume card is waiting. */
export async function setResumeBadge(on: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
    await chrome.action.setBadgeText({ text: on ? "↩" : "" });
    await chrome.action.setTitle({ title: on ? "OrionHUD: pick up where you left off" : "OrionHUD" });
  } catch {
    /* action API unavailable in tests */
  }
}

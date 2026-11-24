import { APP_NAME, NOTIFICATION_ICON } from "../shared/brand";
import type { ExtensionMessage, StateChangeReason } from "../shared/messages";

/** Tells any open side panel to reload from storage. Safe if none is open. */
export function broadcast(reason: StateChangeReason): void {
  const msg: ExtensionMessage = { type: "ORION_STATE_CHANGED", reason };
  chrome.runtime.sendMessage(msg).catch(() => {
    // No side panel open; it reads from storage when it opens.
  });
}

// Manifest icon, so it always ships; used if the notification icon can't be loaded.
const FALLBACK_ICON = "icons/icon128.png";

export async function notify(id: string, title: string, message: string): Promise<void> {
  const show = (icon: string) =>
    chrome.notifications.create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL(icon),
      title,
      message: message.slice(0, 300),
    });
  try {
    await show(NOTIFICATION_ICON);
  } catch {
    // create() rejects when the icon can't be loaded; one retry with the manifest icon.
    try {
      await show(FALLBACK_ICON);
    } catch {
      // Still failing (e.g. the notifications API is unavailable). A missed notification is not worth crashing a handler.
    }
  }
}

/** Toolbar badge hinting that a resume card is waiting. */
export async function setResumeBadge(on: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
    await chrome.action.setBadgeText({ text: on ? "↩" : "" });
    await chrome.action.setTitle({ title: on ? `${APP_NAME}: pick up where you left off` : APP_NAME });
  } catch {
    /* action API unavailable in tests */
  }
}

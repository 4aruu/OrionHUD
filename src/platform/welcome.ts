import { APP_NAME } from "../shared/brand";
import { WELCOME_PAGE } from "../shared/pages";

/**
 * Settings → "Show welcome again": brings an already-open welcome tab to the
 * front instead of opening a second one. runtime.getContexts (Chrome 116+) is
 * feature-detected; if it's missing or fails, a new tab opens. Rejects only
 * when the tab can't be shown, so the caller can report it.
 */
export async function showWelcomeTab(): Promise<void> {
  const url = chrome.runtime.getURL(WELCOME_PAGE);
  let open: chrome.runtime.ExtensionContext | undefined;
  if (typeof chrome.runtime.getContexts === "function") {
    try {
      [open] = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [url] });
    } catch (err) {
      console.warn(`[${APP_NAME}] could not look for an open welcome tab`, err);
    }
  }
  if (open && open.tabId >= 0) {
    await chrome.tabs.update(open.tabId, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

import { WELCOME_PAGE } from "../shared/pages";
import { ensureLiveTabsAlarm } from "./idle";
import { createMenus } from "./menus";

// Menus and the live-tabs alarm are (re)built for every install reason; the
// welcome tab opens only on a fresh install, never on an update or browser update.
export async function onInstalled(details: { reason: string }): Promise<void> {
  createMenus();
  await ensureLiveTabsAlarm();
  if (details.reason === "install") await chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) });
}

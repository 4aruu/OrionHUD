import { APP_NAME } from "../shared/brand";
import { WELCOME_PAGE } from "../shared/pages";
import { ensureLiveTabsAlarm } from "./idle";
import { createMenus } from "./menus";

// Menus and the live-tabs alarm are (re)built for every install reason; the
// welcome tab opens only on a fresh install, never on an update or browser update.
// Each step runs on its own so one failing can't block the others (first run
// must not hang on the alarm), and every failure is logged, never swallowed.
export async function onInstalled(details: { reason: string }): Promise<void> {
  const steps: Array<[string, () => unknown]> = [
    ["create menus", createMenus],
    ["schedule live-tabs alarm", ensureLiveTabsAlarm],
  ];
  if (details.reason === "install") {
    steps.push(["open welcome tab", () => chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) })]);
  }
  const results = await Promise.allSettled(steps.map(async ([, run]) => run()));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[${APP_NAME}] Failed to ${steps[i]?.[0]} on install:`, r.reason);
  });
}

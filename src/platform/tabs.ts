// Thin chrome.tabs / tabGroups plumbing shared by the service worker and the
// side panel. All URL safety and shaping lives in shared/savePoints.ts.

import { isRestorableUrl, sanitizeTabs } from "../shared/savePoints";
import type { ISavedTab, TabsSource } from "../shared/types";

export const TABS_PERMISSION: chrome.permissions.Permissions = { permissions: ["tabs"] };

export async function hasTabsPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(TABS_PERMISSION);
  } catch {
    return false;
  }
}

/** Must be called synchronously from a click handler (user gesture). */
export function requestTabsPermission(): Promise<boolean> {
  return chrome.permissions.request(TABS_PERMISSION).catch(() => false);
}

export function groupTitleFor(taskTitle: string): string {
  return taskTitle.length > 30 ? `${taskTitle.slice(0, 29)}…` : taskTitle;
}

export interface CapturedTabs {
  tabs: ISavedTab[];
  tabsSource: TabsSource;
}

/**
 * The task's tabs. With the optional `tabs` permission: the tabs in the
 * task's tab group if one exists in the focused window, else every normal
 * tab in that window. Without it: just `fallbackTab` if its URL is readable
 * (e.g. via an activeTab grant from a shortcut).
 */
export async function captureTabs(taskTitle: string | null, fallbackTab?: chrome.tabs.Tab): Promise<CapturedTabs> {
  try {
    if (await hasTabsPermission()) {
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      let tabs = await chrome.tabs.query({ windowId: win.id });
      if (taskTitle && chrome.tabGroups) {
        const groups = await chrome.tabGroups.query({ windowId: win.id, title: groupTitleFor(taskTitle) });
        const group = groups[0];
        if (group) {
          const grouped = tabs.filter((t) => t.groupId === group.id);
          if (grouped.length) tabs = grouped;
        }
      }
      const clean = sanitizeTabs(tabs);
      return { tabs: clean, tabsSource: clean.length ? "window" : "none" };
    }
    if (fallbackTab) {
      const clean = sanitizeTabs([fallbackTab]);
      return { tabs: clean, tabsSource: clean.length ? "active" : "none" };
    }
  } catch {
    // Window closed mid-capture, etc. A save point without tabs is still useful.
  }
  return { tabs: [], tabsSource: "none" };
}

async function lastNormalWindowId(): Promise<number | undefined> {
  try {
    return (await chrome.windows.getLastFocused({ windowTypes: ["normal"] })).id;
  } catch {
    return undefined;
  }
}

/**
 * The active tab of the user's last focused normal browser window. Never the
 * Orion panel window, which can be the last focused window in window mode.
 */
export async function activeNormalTab(): Promise<chrome.tabs.Tab | undefined> {
  const windowId = await lastNormalWindowId();
  if (windowId === undefined) return undefined;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  return tab;
}

/**
 * Reopens tabs in the user's last normal window as one named group. URLs are
 * re-validated here even though they were validated on capture: stored data
 * can come from an imported file.
 */
export async function restoreTabs(tabs: ISavedTab[], taskTitle: string): Promise<number> {
  const urls = tabs.map((t) => t.url).filter(isRestorableUrl);
  if (!urls.length) return 0;
  // Called from the panel. In window mode the panel's own window is the
  // "current" one, so always target the user's normal browser window.
  let windowId = await lastNormalWindowId();
  const created: number[] = [];
  if (windowId === undefined) {
    // No browser window open (only the Orion window): open one with the first tab.
    try {
      const win = await chrome.windows.create({ url: urls[0], focused: true });
      windowId = win?.id;
      const first = win?.tabs?.[0]?.id;
      if (first !== undefined) created.push(first);
      if (windowId !== undefined) urls.shift();
    } catch {
      // Fall through: tabs.create below lets the browser pick a window.
    }
  }
  for (const [i, url] of urls.entries()) {
    // Only the first reopened tab takes focus (it may already be the new window's tab).
    const tab = await chrome.tabs.create({ url, active: i === 0 && created.length === 0, windowId });
    if (tab.id !== undefined) created.push(tab.id);
  }
  if (windowId !== undefined) void chrome.windows.update(windowId, { focused: true }).catch(() => undefined);
  try {
    if (created.length) {
      const groupId = await chrome.tabs.group({
        tabIds: created as [number, ...number[]],
        ...(windowId !== undefined ? { createProperties: { windowId } } : {}),
      });
      await chrome.tabGroups.update(groupId, { title: groupTitleFor(taskTitle), color: "purple" });
    }
  } catch {
    // Grouping is a nicety; the tabs are open either way.
  }
  return created.length;
}

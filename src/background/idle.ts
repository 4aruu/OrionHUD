// Automatic save points: when you step away (idle or screen lock), and when
// the browser restarts after a crash/force-quit (from the rolling snapshot).

import { getLiveTabs, mutateMeta, setLiveTabs } from "../shared/db";
import { recordSavePoint } from "../shared/workflowActions";
import { captureTabs, hasTabsPermission } from "../platform/tabs";
import { getActiveContext } from "./context";
import { broadcast, setResumeBadge } from "./notify";

/** 5 minutes: long enough to skip a coffee refill, short enough to catch a meeting. */
export const IDLE_THRESHOLD_SECONDS = 300;
export const LIVE_TABS_ALARM = "orion-live-tabs";
const DEDUPE_MS = 2 * 60_000;

export async function onIdleStateChanged(state: string): Promise<void> {
  if (state === "active") {
    broadcast("active");
    return;
  }
  // idle or locked
  const now = Date.now();
  await mutateMeta((m) => ({ ...m, lastActiveTimestamp: now }));
  const { workflow, task } = await getActiveContext();
  if (!workflow || !task) return;
  // idle → locked fires twice in a row; one save point is enough.
  const latest = task.savePoints[0];
  if (latest && latest.trigger === "idle" && now - latest.createdAt < DEDUPE_MS) return;
  const tabs = await captureTabs(task.title);
  await recordSavePoint(workflow.id, task.id, { trigger: "idle", ...tabs });
  await setResumeBadge(true);
  broadcast("idle");
}

/** Periodic rolling snapshot so a crash still leaves recoverable tabs. */
export async function refreshLiveTabs(): Promise<void> {
  if (!(await hasTabsPermission())) return;
  const { workflow, task } = await getActiveContext();
  if (!workflow || !task) {
    await setLiveTabs(null);
    return;
  }
  const { tabs } = await captureTabs(task.title);
  if (tabs.length) await setLiveTabs({ workflowId: workflow.id, taskId: task.id, tabs, updatedAt: Date.now() });
}

/** On browser start: turn the last rolling snapshot into a real save point. */
export async function recoverOnStartup(): Promise<void> {
  const [live, ctx] = await Promise.all([getLiveTabs(), getActiveContext()]);
  if (ctx.workflow && ctx.task) {
    const usable = live && live.workflowId === ctx.workflow.id && live.taskId === ctx.task.id ? live.tabs : [];
    await recordSavePoint(ctx.workflow.id, ctx.task.id, {
      trigger: "restart",
      tabs: usable,
      tabsSource: usable.length ? "window" : "none",
    });
    await setResumeBadge(true);
  }
  await setLiveTabs(null);
}

export async function ensureLiveTabsAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(LIVE_TABS_ALARM);
  if (!existing) await chrome.alarms.create(LIVE_TABS_ALARM, { periodInMinutes: 2 });
}

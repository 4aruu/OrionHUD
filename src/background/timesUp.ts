import { APP_NAME } from "../shared/brand";
import { findTaskNode } from "../shared/taskTree";
import { evaluateDrift } from "../shared/urlMatching";
import { taskIdFromAlarmName } from "../shared/alarms";
import { getActiveContext } from "./context";
import { notify } from "./notify";
import { activeNormalTab } from "../platform/tabs";

export async function handleTaskAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  const taskId = taskIdFromAlarmName(alarm.name);
  if (!taskId) return;

  const { workflow } = await getActiveContext();
  if (!workflow) return;
  const task = findTaskNode(workflow.rootNodes, taskId);
  if (!task || task.status !== "ACTIVE") return;

  // URL is only readable with the optional tabs permission; "unknown" otherwise.
  const activeTab = await activeNormalTab();
  const drift = evaluateDrift(activeTab?.url, task.targetUrl);

  const message =
    drift === "drifted"
      ? `The timebox for “${task.title}” has ended, and you're on a different page now. Keep going, or adjust it in ${APP_NAME}.`
      : `The timebox for “${task.title}” has ended. Keep going, or give it more time in ${APP_NAME}.`;

  await notify(`orion-notif:${task.id}`, `${APP_NAME}: timebox ended`, message);
}

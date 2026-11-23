import { getMeta, getWorkflow } from "../shared/db";
import { findTaskNode } from "../shared/taskTree";
import { evaluateDrift } from "../shared/urlMatching";
import { taskIdFromAlarmName } from "../shared/alarms";
import type { ExtensionMessage } from "../shared/messages";

export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  const taskId = taskIdFromAlarmName(alarm.name);
  if (!taskId) return; // not one of ours, ignore

  const meta = await getMeta();
  if (!meta.activeWorkflowId) return;

  const workflow = await getWorkflow(meta.activeWorkflowId);
  if (!workflow) return;

  const task = findTaskNode(workflow.rootNodes, taskId);
  if (!task) return;

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const drift = evaluateDrift(activeTab?.url, task.targetUrl);

  // chrome.notifications is the baseline channel: no host permission
  // required, fires whether or not this tab is one OrionHUD currently
  // has permission to read the URL of. The in-page modal below is a
  // progressive enhancement on top of this, not a replacement for it,
  // because it depends on a permission grant that may not exist.
  const message =
    drift === "drifted"
      ? `Timer done for "${task.title}". Looks like you've drifted off it.`
      : drift === "unknown"
        ? `Timer done for "${task.title}". Open OrionHUD to confirm you're on track, this tab's URL isn't visible to it right now.`
        : `Timer done for "${task.title}".`;

  await chrome.notifications.create(`orion-notif:${task.id}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "OrionHUD: Time's Up",
    message,
  });

  if (activeTab?.id !== undefined) {
    const msg: ExtensionMessage = {
      type: "ORION_TIMES_UP",
      taskId: task.id,
      taskTitle: task.title,
      drift,
    };
    chrome.tabs
      .sendMessage(activeTab.id, msg)
      .catch(() => {
        // No content script listening on this tab. Fine, the
        // notification above already covered the baseline case.
      });
  }
}

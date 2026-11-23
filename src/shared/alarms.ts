import type { ITaskNode } from "./types";

// chrome.alarms has a practical minimum granularity of about 1 minute
// for packed extensions. allocatedTimeMs below this is clamped up, not
// silently dropped, so a 30-second task doesn't just never fire.
const MIN_ALARM_MS = 60_000;
const ALARM_PREFIX = "orion-task:";

export function alarmNameForTask(taskId: string): string {
  return `${ALARM_PREFIX}${taskId}`;
}

export function taskIdFromAlarmName(name: string): string | null {
  return name.startsWith(ALARM_PREFIX)
    ? name.slice(ALARM_PREFIX.length)
    : null;
}

export async function scheduleTaskAlarm(task: ITaskNode): Promise<void> {
  if (task.allocatedTimeMs === null) return; // manual checkpoint, no timer
  const ms = Math.max(task.allocatedTimeMs, MIN_ALARM_MS);
  await chrome.alarms.create(alarmNameForTask(task.id), {
    delayInMinutes: ms / 60_000,
  });
}

export async function clearTaskAlarm(taskId: string): Promise<void> {
  await chrome.alarms.clear(alarmNameForTask(taskId));
}

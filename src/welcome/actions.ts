// Data actions behind the welcome page. Validation failures surface as OrionError.

import { captureTabs } from "../platform/tabs";
import { validateNextStep } from "../shared/validators";
import { addTask, createWorkflow, recordSavePoint, startWorkflow } from "../shared/workflowActions";

export async function startFromWelcome(title: string): Promise<{ workflowId: string; taskId: string }> {
  const wf = await createWorkflow(title, 5);
  const task = await addTask(wf.id, null, title);
  await startWorkflow(wf.id, task.id);
  return { workflowId: wf.id, taskId: task.id };
}

export async function pickUpTask(workflowId: string, taskId: string): Promise<void> {
  await startWorkflow(workflowId, taskId);
}

export async function saveFromWelcome(
  workflowId: string,
  taskId: string,
  taskTitle: string,
  nextStep: string
): Promise<void> {
  const { tabs, tabsSource } = await captureTabs(taskTitle);
  await recordSavePoint(workflowId, taskId, { trigger: "manual", tabs, tabsSource, nextStep: validateNextStep(nextStep) });
}

/** Records a next step on its own save point. Returns false (no write) when it's empty. */
export async function attachNextStep(workflowId: string, taskId: string, nextStep: string): Promise<boolean> {
  const step = validateNextStep(nextStep);
  if (!step) return false;
  await recordSavePoint(workflowId, taskId, { trigger: "manual", nextStep: step });
  return true;
}

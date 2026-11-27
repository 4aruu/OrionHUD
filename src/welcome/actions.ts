// Data actions behind the welcome page. Validation failures surface as OrionError.

import { captureTabs } from "../platform/tabs";
import { validateNextStep } from "../shared/validators";
import { addTask, createWorkflow, deleteWorkflowCascade, recordSavePoint, startWorkflow } from "../shared/workflowActions";

export async function startFromWelcome(title: string): Promise<{ workflowId: string; taskId: string }> {
  const wf = await createWorkflow(title, 5);
  try {
    const task = await addTask(wf.id, null, title);
    await startWorkflow(wf.id, task.id);
    return { workflowId: wf.id, taskId: task.id };
  } catch (err) {
    // Not atomic: don't leave an empty workflow behind, or a retry would create a second one.
    await deleteWorkflowCascade(wf.id);
    throw err;
  }
}

export async function pickUpTask(workflowId: string, taskId: string): Promise<void> {
  await startWorkflow(workflowId, taskId);
}

/**
 * The "Save without the shortcut" button: captures tabs and records ONE save
 * point carrying `nextStep`. Don't also call attachNextStep for the same save.
 */
export async function saveFromWelcome(
  workflowId: string,
  taskId: string,
  taskTitle: string,
  nextStep: string
): Promise<void> {
  const { tabs, tabsSource } = await captureTabs(taskTitle);
  await recordSavePoint(workflowId, taskId, { trigger: "manual", tabs, tabsSource, nextStep: validateNextStep(nextStep) });
}

/**
 * The shortcut flow: after the shortcut's own save point lands, called once to
 * attach the typed next step (on its own save point). Returns false (no write)
 * when empty. Don't call it after saveFromWelcome.
 */
export async function attachNextStep(workflowId: string, taskId: string, nextStep: string): Promise<boolean> {
  const step = validateNextStep(nextStep);
  if (!step) return false;
  await recordSavePoint(workflowId, taskId, { trigger: "manual", nextStep: step });
  return true;
}

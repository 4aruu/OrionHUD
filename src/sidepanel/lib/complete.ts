import type { ITaskNode, IWorkflowState } from "../../shared/types";
import { findTaskNode } from "../../shared/taskTree";
import { OrionError, completeTask, reopenTask } from "../../shared/workflowActions";
import { errorMessage } from "./format";
import type { Ui } from "./ui";

interface Options {
  workflow: IWorkflowState;
  node: ITaskNode;
  activeId: string | null;
  ui: Ui;
  /** Start working on another task (from the "Next up" toast). */
  onStart: (taskId: string) => void;
}

/**
 * Mark a task done and say what that means: the next task, a parent that
 * can now be finished too, or that subtasks are still open. A plain "Done."
 * offers Undo, since finished tasks fold away out of the list.
 */
export async function completeWithFeedback(opts: Options, cascade = false): Promise<void> {
  const { workflow, node, activeId, ui, onStart } = opts;
  try {
    const r = await completeTask(workflow.id, node.id, { cascade });
    await ui.reload();
    const parent = r.parentReadyId ? findTaskNode(workflow.rootNodes, r.parentReadyId) : undefined;
    const next = r.nextTaskId ? findTaskNode(workflow.rootNodes, r.nextTaskId) : undefined;
    if (parent) {
      ui.toast({
        kind: "info",
        text: `All of “${parent.title}” is done.`,
        action: { label: "Complete it", run: () => void completeWithFeedback({ ...opts, node: parent }) },
      });
    } else if (node.id === activeId && next) {
      ui.toast({ kind: "info", text: `Next up: ${next.title}`, action: { label: "Start", run: () => onStart(next.id) } });
    } else {
      ui.toast({
        kind: "info",
        text: `Done: ${node.title}`,
        action: { label: "Undo", run: () => void ui.run(() => reopenTask(workflow.id, node.id)) },
      });
    }
  } catch (err) {
    if (err instanceof OrionError && err.code === "open-children") {
      ui.toast({ kind: "info", text: err.message, action: { label: "Complete all", run: () => void completeWithFeedback(opts, true) } });
    } else {
      ui.toast({ kind: "error", text: errorMessage(err) });
    }
  }
}

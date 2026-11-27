// Pure first-run checklist logic. No chrome.* or db calls.

import type { IAppMeta, ITaskNode, IWorkflowState } from "../shared/types";
import { findTaskNode, walk } from "../shared/taskTree";

export type StepId = "task" | "tabs" | "save" | "pin";
export type StepStatus = "done" | "current" | "todo";

export interface RecentTask {
  workflowId: string;
  taskId: string;
  title: string;
  workflowName: string;
}

export interface WelcomeFacts {
  workflows: IWorkflowState[];
  meta: IAppMeta;
  tabsGranted: boolean;
  tabsAnswered: boolean;
  openedAt: number;
  /** null when the browser can't tell us (never blocks the checklist). */
  pinned: boolean | null;
}

export interface WelcomeState {
  steps: Record<StepId, StepStatus>;
  taskMode: "create" | "pick" | "done";
  active: { workflow: IWorkflowState; task: ITaskNode } | null;
  /** Only filled in "pick" mode, max 5. */
  recent: RecentTask[];
  savedSinceOpen: boolean;
}

const ORDER: StepId[] = ["task", "tabs", "save", "pin"];
const MAX_RECENT = 5;

function resolveActive(f: WelcomeFacts): WelcomeState["active"] {
  const { activeWorkflowId, currentActiveNodeId } = f.meta;
  if (!activeWorkflowId || !currentActiveNodeId) return null;
  const workflow = f.workflows.find((w) => w.id === activeWorkflowId);
  const task = workflow && findTaskNode(workflow.rootNodes, currentActiveNodeId);
  return workflow && task ? { workflow, task } : null;
}

function openTasks(workflows: IWorkflowState[]): Array<RecentTask & { savedAt: number; startedAt: number }> {
  const out: Array<RecentTask & { savedAt: number; startedAt: number }> = [];
  for (const wf of workflows) {
    walk(wf.rootNodes, (n) => {
      if (n.status === "DONE") return;
      out.push({
        workflowId: wf.id,
        taskId: n.id,
        title: n.title,
        workflowName: wf.name,
        savedAt: n.savePoints[0]?.createdAt ?? -Infinity,
        startedAt: n.startedAt ?? -Infinity,
      });
    });
  }
  return out;
}

function byNewest(a: number, b: number): number {
  // Not `b - a`: -Infinity - -Infinity is NaN.
  return a === b ? 0 : b > a ? 1 : -1;
}

export function computeWelcome(f: WelcomeFacts): WelcomeState {
  const active = resolveActive(f);
  const open = openTasks(f.workflows);
  const taskMode: WelcomeState["taskMode"] = active ? "done" : open.length ? "pick" : "create";

  const recent: RecentTask[] =
    taskMode === "pick"
      ? open
          .sort((a, b) => byNewest(a.savedAt, b.savedAt) || byNewest(a.startedAt, b.startedAt))
          .slice(0, MAX_RECENT)
          .map(({ workflowId, taskId, title, workflowName }) => ({ workflowId, taskId, title, workflowName }))
      : [];

  const savedSinceOpen = !!active && active.task.savePoints.some((s) => s.createdAt >= f.openedAt);

  const done: Record<StepId, boolean> = {
    task: active !== null,
    tabs: f.tabsGranted || f.tabsAnswered,
    save: savedSinceOpen,
    pin: f.pinned === true,
  };

  const steps = {} as Record<StepId, StepStatus>;
  let currentTaken = false;
  for (const id of ORDER) {
    if (done[id]) steps[id] = "done";
    else if (!currentTaken && !(id === "save" && !done.task)) {
      steps[id] = "current";
      currentTaken = true;
    } else steps[id] = "todo";
  }

  return { steps, taskMode, active, recent, savedSinceOpen };
}

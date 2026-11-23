// Runs agent-bridge requests against storage, through workflowActions like
// every other write. Runs in the service worker; no chrome.* here beyond
// what workflowActions already uses (alarms).
//
// Scope rule: an agent can only read and change the task the user is
// working on (the active task) and its subtasks. It can't see other
// workflows, touch other branches, or delete anything.

import { getMeta, getWorkflow } from "./db";
import { buildBrief, inline } from "./brief";
import { findTaskNode } from "./taskTree";
import type { ITaskNode, IWorkflowState } from "./types";
import { OrionError, addNote, addTask, completeTask } from "./workflowActions";
import { errorResponse, okResponse, type BridgeRequest, type BridgeResponse } from "./bridgeProtocol";

export interface BridgeOutcome {
  response: BridgeResponse;
  /** True when storage changed, so the side panel should reload. */
  changed: boolean;
}

const MAX_LISTED = 50;

const NO_ACTIVE_TASK =
  "No task is active in OrionHUD. Ask the user to pick one in the side panel (select it and press “.”).";

function inScope(task: ITaskNode, id: string): ITaskNode | undefined {
  return id === task.id ? task : findTaskNode(task.subTasks, id);
}

function quote(node: ITaskNode): string {
  return `“${inline(node.title)}”`;
}

function listOpen(task: ITaskNode): string {
  const lines: string[] = [];
  let truncated = false;
  const visit = (nodes: ITaskNode[], depth: number) => {
    for (const n of nodes) {
      if (n.status === "DONE") continue;
      if (lines.length >= MAX_LISTED) {
        truncated = true;
        return;
      }
      lines.push(`${"  ".repeat(depth)}- [ ] ${inline(n.title)}${n.isMilestone ? " (milestone)" : ""} · id: ${n.id}`);
      visit(n.subTasks, depth + 1);
    }
  };
  visit(task.subTasks, 0);
  const head = `Current task: ${inline(task.title)} · id: ${task.id}`;
  if (!lines.length) return `${head}\n\nNo open subtasks.`;
  return [head, "", "Open subtasks:", ...lines, ...(truncated ? [`(showing the first ${MAX_LISTED})`] : [])].join("\n");
}

function fromError(id: number, err: unknown): BridgeResponse {
  if (err instanceof OrionError) {
    switch (err.code) {
      case "invalid-input":
        return errorResponse(id, "invalid-request", err.message);
      case "not-found":
        return errorResponse(id, "not-found", err.message);
      case "open-children":
        return errorResponse(id, "open-children", `${err.message} Complete those first.`);
      case "max-nodes":
      case "max-depth":
      case "max-inbox":
        return errorResponse(id, "limit", err.message);
      default:
        break;
    }
  }
  // Never forward internal error text: it can contain storage details.
  return errorResponse(id, "internal", "OrionHUD couldn't do that. Try again, or use the side panel.");
}

async function activeContext(): Promise<{ workflow: IWorkflowState; task: ITaskNode } | null> {
  const meta = await getMeta();
  if (!meta.activeWorkflowId || !meta.currentActiveNodeId) return null;
  const workflow = await getWorkflow(meta.activeWorkflowId);
  const task = workflow ? findTaskNode(workflow.rootNodes, meta.currentActiveNodeId) : undefined;
  return workflow && task ? { workflow, task } : null;
}

export async function handleBridgeRequest(req: BridgeRequest): Promise<BridgeOutcome> {
  const unchanged = (response: BridgeResponse): BridgeOutcome => ({ response, changed: false });
  try {
    const ctx = await activeContext();
    if (!ctx) return unchanged(errorResponse(req.id, "no-active-task", NO_ACTIVE_TASK));
    const { workflow, task } = ctx;

    const target = (id: string | undefined): ITaskNode | BridgeResponse => {
      if (id === undefined) return task;
      return (
        inScope(task, id) ??
        errorResponse(req.id, "out-of-scope", `No task with id ${id} under the current task ${quote(task)}. Use list_open_subtasks for valid ids.`)
      );
    };
    const isResponse = (x: ITaskNode | BridgeResponse): x is BridgeResponse => "type" in x;

    switch (req.method) {
      case "get_current_task":
        return unchanged(okResponse(req.id, buildBrief(workflow, task.id)));

      case "list_open_subtasks":
        return unchanged(okResponse(req.id, listOpen(task)));

      case "add_subtask": {
        const parent = target(req.params.parent_id);
        if (isResponse(parent)) return unchanged(parent);
        const added = await addTask(workflow.id, parent.id, req.params.title);
        return { response: okResponse(req.id, `Added ${quote(added)} under ${quote(parent)} · id: ${added.id}`), changed: true };
      }

      case "complete_task": {
        const node = target(req.params.task_id);
        if (isResponse(node)) return unchanged(node);
        if (node.status === "DONE") return unchanged(okResponse(req.id, `${quote(node)} was already done.`));
        const result = await completeTask(workflow.id, node.id);
        const after = await getWorkflow(workflow.id);
        const lines = [`Completed ${quote(node)}.`];
        const parent = result.parentReadyId && after ? findTaskNode(after.rootNodes, result.parentReadyId) : undefined;
        if (parent) lines.push(`All subtasks of ${quote(parent)} are done. Ask the user whether to complete it (id: ${parent.id}).`);
        const next = result.nextTaskId && after ? findTaskNode(after.rootNodes, result.nextTaskId) : undefined;
        if (next && inScope(task, next.id)) lines.push(`Next open subtask: ${quote(next)} · id: ${next.id}`);
        if (node.id === task.id) lines.push("That was the current task, so no task is active now.");
        return { response: okResponse(req.id, lines.join("\n")), changed: true };
      }

      case "log_decision": {
        const node = target(req.params.task_id);
        if (isResponse(node)) return unchanged(node);
        await addNote(workflow.id, node.id, req.params.text, "decision");
        return { response: okResponse(req.id, `Logged the decision on ${quote(node)}.`), changed: true };
      }
    }
  } catch (err) {
    return unchanged(fromError(req.id, err));
  }
}

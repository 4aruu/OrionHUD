// The layer Phase 3's click-to-invoke handler and Phase 5's side panel
// UI actually call. Without this, UI code would end up composing
// mutateWorkflow + commitMeta + scheduleTaskAlarm inline inside event
// handlers, which is exactly the kind of logic that's easy to get
// subtly wrong and hard to unit test once it's tangled up with DOM or
// chrome.tabs code.

import {
  commitMeta,
  getMeta,
  getWorkflow,
  mutateWorkflow,
  commitWorkflow,
} from "./db";
import { scheduleTaskAlarm, clearTaskAlarm } from "./alarms";
import type { IMicroNote, ITaskNode, IWorkflowState } from "./types";

function newId(): string {
  return crypto.randomUUID();
}

export async function createWorkflow(
  name: string,
  globalGracePeriodMins: number,
  blacklistedDomains: string[] = [],
  category?: string
): Promise<IWorkflowState> {
  const workflow: IWorkflowState = {
    id: newId(),
    name,
    category,
    globalGracePeriodMins,
    blacklistedDomains,
    rootNodes: [],
  };
  await commitWorkflow(workflow);
  return workflow;
}

export interface AddTaskOptions {
  allocatedTimeMs?: number | null;
  targetUrl?: string | null;
}

export async function addTask(
  workflowId: string,
  parentId: string | null,
  title: string,
  options: AddTaskOptions = {}
): Promise<ITaskNode> {
  const newTask: ITaskNode = {
    id: newId(),
    parentId,
    title,
    status: "PENDING",
    allocatedTimeMs: options.allocatedTimeMs ?? null,
    timeRemainingMs: options.allocatedTimeMs ?? null,
    startedAt: null,
    completedAt: null,
    targetUrl: options.targetUrl ?? null,
    microNotes: [],
    subTasks: [],
  };

  await mutateWorkflow(workflowId, (state) => {
    if (parentId === null) {
      return { ...state, rootNodes: [...state.rootNodes, newTask] };
    }
    const insert = (nodes: ITaskNode[]): ITaskNode[] =>
      nodes.map((n) =>
        n.id === parentId
          ? { ...n, subTasks: [...n.subTasks, newTask] }
          : { ...n, subTasks: insert(n.subTasks) }
      );
    return { ...state, rootNodes: insert(state.rootNodes) };
  });

  return newTask;
}

export function findTaskInWorkflow(
  workflow: IWorkflowState,
  taskId: string
): ITaskNode | undefined {
  const search = (nodes: ITaskNode[]): ITaskNode | undefined => {
    for (const n of nodes) {
      if (n.id === taskId) return n;
      const found = search(n.subTasks);
      if (found) return found;
    }
    return undefined;
  };
  return search(workflow.rootNodes);
}

// The one function that bridges storage state and the chrome.alarms
// side effect, so it's the one most worth testing with a chrome mock
// (see test/workflowActions.test.ts).
export async function startWorkflow(
  workflowId: string,
  firstTaskId: string
): Promise<void> {
  const meta = await getMeta();
  await commitMeta({
    ...meta,
    activeWorkflowId: workflowId,
    currentActiveNodeId: firstTaskId,
    lastActiveTimestamp: Date.now(),
  });

  const updated = await mutateWorkflow(workflowId, (state) => {
    const mark = (nodes: ITaskNode[]): ITaskNode[] =>
      nodes.map((n) =>
        n.id === firstTaskId
          ? { ...n, status: "ACTIVE" as const, startedAt: Date.now() }
          : { ...n, subTasks: mark(n.subTasks) }
      );
    return { ...state, rootNodes: mark(state.rootNodes) };
  });

  const task = findTaskInWorkflow(updated, firstTaskId);
  if (task) await scheduleTaskAlarm(task);
}

export async function completeTask(
  workflowId: string,
  taskId: string
): Promise<void> {
  await mutateWorkflow(workflowId, (state) => {
    const mark = (nodes: ITaskNode[]): ITaskNode[] =>
      nodes.map((n) =>
        n.id === taskId
          ? { ...n, status: "DONE" as const, completedAt: Date.now() }
          : { ...n, subTasks: mark(n.subTasks) }
      );
    return { ...state, rootNodes: mark(state.rootNodes) };
  });
  await clearTaskAlarm(taskId);
}

export async function addMicroNote(
  workflowId: string,
  taskId: string,
  content: string,
  isActionableCommand: boolean
): Promise<void> {
  const note: IMicroNote = {
    id: newId(),
    content,
    timestamp: Date.now(),
    isActionableCommand,
  };
  await mutateWorkflow(workflowId, (state) => {
    const add = (nodes: ITaskNode[]): ITaskNode[] =>
      nodes.map((n) =>
        n.id === taskId
          ? { ...n, microNotes: [...n.microNotes, note] }
          : { ...n, subTasks: add(n.subTasks) }
      );
    return { ...state, rootNodes: add(state.rootNodes) };
  });
}

export { getWorkflow };

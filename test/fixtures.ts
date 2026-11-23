import type { ITaskNode, IWorkflowState } from "../src/shared/types";

export function makeTask(
  id: string,
  subTasks: ITaskNode[] = [],
  overrides: Partial<ITaskNode> = {}
): ITaskNode {
  return {
    id,
    parentId: null,
    title: id,
    status: "PENDING",
    allocatedTimeMs: null,
    timeRemainingMs: null,
    startedAt: null,
    completedAt: null,
    targetUrl: null,
    isMilestone: false,
    collapsed: false,
    microNotes: [],
    savePoints: [],
    subTasks: subTasks.map((s) => ({ ...s, parentId: id })),
    ...overrides,
  };
}

export function makeWorkflow(
  rootNodes: ITaskNode[] = [],
  overrides: Partial<IWorkflowState> = {}
): IWorkflowState {
  return {
    id: "wf-1",
    name: "Test workflow",
    createdAt: 1,
    globalGracePeriodMins: 5,
    blacklistedDomains: [],
    rootNodes,
    inbox: [],
    ...overrides,
  };
}

// Pre-order ids, handy for asserting tree shape.
export function ids(nodes: ITaskNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...ids(n.subTasks)]);
}

// "a(b,c(d))" style shape string.
export function shape(nodes: ITaskNode[]): string {
  return nodes
    .map((n) => (n.subTasks.length ? `${n.id}(${shape(n.subTasks)})` : n.id))
    .join(",");
}

import { getMeta, getWorkflow } from "../shared/db";
import { findTaskNode } from "../shared/taskTree";
import type { IAppMeta, ITaskNode, IWorkflowState } from "../shared/types";

export interface ActiveContext {
  meta: IAppMeta;
  workflow: IWorkflowState | null;
  task: ITaskNode | null;
}

/** Fresh from storage every time: the worker keeps nothing in memory. */
export async function getActiveContext(): Promise<ActiveContext> {
  const meta = await getMeta();
  const workflow = meta.activeWorkflowId ? ((await getWorkflow(meta.activeWorkflowId)) ?? null) : null;
  const task = workflow && meta.currentActiveNodeId ? (findTaskNode(workflow.rootNodes, meta.currentActiveNodeId) ?? null) : null;
  return { meta, workflow, task };
}

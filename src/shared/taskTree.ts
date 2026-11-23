import type { ITaskNode } from "./types";

export function findTaskNode(
  nodes: ITaskNode[],
  id: string
): ITaskNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTaskNode(node.subTasks, id);
    if (found) return found;
  }
  return undefined;
}

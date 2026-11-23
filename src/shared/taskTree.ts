// Pure, immutable task-tree operations. No chrome.* and no storage: every
// structural edit in workflowActions.ts goes through these, so the tricky
// parts (parentId bookkeeping, depth limits, ordering) are unit tested here.
//
// Unchanged subtrees keep their object identity, which keeps React renders
// cheap and makes "no-op" detectable with ===.

import type { ITaskNode } from "./types";
import { LIMITS } from "./validators";

export function findTaskNode(nodes: ITaskNode[], id: string): ITaskNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTaskNode(node.subTasks, id);
    if (found) return found;
  }
  return undefined;
}

/** Root-to-node chain (inclusive). Empty when the id is not in the tree. */
export function findPath(nodes: ITaskNode[], id: string): ITaskNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const sub = findPath(node.subTasks, id);
    if (sub.length) return [node, ...sub];
  }
  return [];
}

/** Root = 1. Missing = 0. */
export function depthOf(nodes: ITaskNode[], id: string): number {
  return findPath(nodes, id).length;
}

/** Levels in the subtree rooted at node, including the node itself. */
export function subtreeHeight(node: ITaskNode): number {
  let max = 0;
  for (const c of node.subTasks) max = Math.max(max, subtreeHeight(c));
  return 1 + max;
}

export function countNodes(nodes: ITaskNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countNodes(node.subTasks);
  return n;
}

export function walk(nodes: ITaskNode[], fn: (node: ITaskNode) => void): void {
  for (const node of nodes) {
    fn(node);
    walk(node.subTasks, fn);
  }
}

export function updateNode(
  nodes: ITaskNode[],
  id: string,
  fn: (node: ITaskNode) => ITaskNode
): ITaskNode[] {
  let changed = false;
  const next = nodes.map((n) => {
    if (n.id === id) {
      changed = true;
      return fn(n);
    }
    const subs = updateNode(n.subTasks, id, fn);
    if (subs === n.subTasks) return n;
    changed = true;
    return { ...n, subTasks: subs };
  });
  return changed ? next : nodes;
}

/** Applies fn to every node in the subtree rooted at node (inclusive). */
export function mapSubtree(node: ITaskNode, fn: (n: ITaskNode) => ITaskNode): ITaskNode {
  const mapped = fn(node);
  return { ...mapped, subTasks: mapped.subTasks.map((c) => mapSubtree(c, fn)) };
}

function withParent(node: ITaskNode, parentId: string | null): ITaskNode {
  return node.parentId === parentId ? node : { ...node, parentId };
}

function insertAt<T>(list: T[], item: T, index?: number): T[] {
  const i = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/** Inserts under parentId (null = root) at index (default: end). */
export function insertNode(
  nodes: ITaskNode[],
  parentId: string | null,
  node: ITaskNode,
  index?: number
): ITaskNode[] {
  const placed = withParent(node, parentId);
  if (parentId === null) return insertAt(nodes, placed, index);
  return updateNode(nodes, parentId, (p) => ({ ...p, subTasks: insertAt(p.subTasks, placed, index) }));
}

export interface RemoveResult {
  nodes: ITaskNode[];
  removed: ITaskNode | null;
  parentId: string | null;
  index: number;
}

export function removeNode(nodes: ITaskNode[], id: string): RemoveResult {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    return {
      nodes: [...nodes.slice(0, idx), ...nodes.slice(idx + 1)],
      removed: nodes[idx] ?? null,
      parentId: null,
      index: idx,
    };
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const r = removeNode(n.subTasks, id);
    if (r.removed) {
      const next = [...nodes];
      next[i] = { ...n, subTasks: r.nodes };
      return { nodes: next, removed: r.removed, parentId: r.parentId ?? n.id, index: r.index };
    }
  }
  return { nodes, removed: null, parentId: null, index: -1 };
}

/** Siblings list containing id, plus the parent id (null for roots). */
function siblingsOf(
  nodes: ITaskNode[],
  id: string
): { siblings: ITaskNode[]; parentId: string | null } | null {
  if (nodes.some((n) => n.id === id)) return { siblings: nodes, parentId: null };
  for (const n of nodes) {
    if (n.subTasks.some((c) => c.id === id)) return { siblings: n.subTasks, parentId: n.id };
    const deeper = siblingsOf(n.subTasks, id);
    if (deeper) return deeper;
  }
  return null;
}

/** Makes the node the last child of its previous sibling. No-op if impossible. */
export function indentNode(
  nodes: ITaskNode[],
  id: string,
  maxDepth: number = LIMITS.maxDepth
): ITaskNode[] {
  const ctx = siblingsOf(nodes, id);
  if (!ctx) return nodes;
  const idx = ctx.siblings.findIndex((n) => n.id === id);
  const prev = ctx.siblings[idx - 1];
  const node = ctx.siblings[idx];
  if (!prev || !node) return nodes;
  const newDepth = depthOf(nodes, prev.id) + subtreeHeight(node);
  if (newDepth > maxDepth) return nodes;
  const { nodes: without } = removeNode(nodes, id);
  return insertNode(without, prev.id, node);
}

/** Moves the node to directly after its parent. No-op for roots. */
export function outdentNode(nodes: ITaskNode[], id: string): ITaskNode[] {
  const ctx = siblingsOf(nodes, id);
  if (!ctx || ctx.parentId === null) return nodes;
  const parentCtx = siblingsOf(nodes, ctx.parentId);
  if (!parentCtx) return nodes;
  const parentIndex = parentCtx.siblings.findIndex((n) => n.id === ctx.parentId);
  const { nodes: without, removed } = removeNode(nodes, id);
  if (!removed) return nodes;
  return insertNode(without, parentCtx.parentId, removed, parentIndex + 1);
}

/** Swaps with the previous (-1) or next (1) sibling. No-op at the edges. */
export function moveNode(nodes: ITaskNode[], id: string, dir: -1 | 1): ITaskNode[] {
  const ctx = siblingsOf(nodes, id);
  if (!ctx) return nodes;
  const idx = ctx.siblings.findIndex((n) => n.id === id);
  const target = idx + dir;
  if (target < 0 || target >= ctx.siblings.length) return nodes;
  const swapped = [...ctx.siblings];
  [swapped[idx], swapped[target]] = [swapped[target]!, swapped[idx]!];
  if (ctx.parentId === null) return swapped;
  return updateNode(nodes, ctx.parentId, (p) => ({ ...p, subTasks: swapped }));
}

/** Done/total over leaves. A DONE parent counts all of its leaves as done. */
export function leafProgress(nodes: ITaskNode[], parentDone = false): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const n of nodes) {
    const isDone = parentDone || n.status === "DONE";
    if (n.subTasks.length === 0) {
      total += 1;
      if (isDone) done += 1;
    } else {
      const sub = leafProgress(n.subTasks, isDone);
      done += sub.done;
      total += sub.total;
    }
  }
  return { done, total };
}

/** Pending leaves in document order, skipping anything under a DONE node. */
function pendingLeaves(nodes: ITaskNode[], out: ITaskNode[] = []): ITaskNode[] {
  for (const n of nodes) {
    if (n.status === "DONE") continue;
    if (n.subTasks.length === 0) {
      if (n.status === "PENDING") out.push(n);
    } else {
      pendingLeaves(n.subTasks, out);
    }
  }
  return out;
}

function documentOrder(nodes: ITaskNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...documentOrder(n.subTasks)]);
}

/**
 * The "what's next" suggestion after finishing afterId: the first pending
 * leaf after it in document order, wrapping to the top. Null when nothing
 * is left.
 */
export function nextPendingTask(nodes: ITaskNode[], afterId: string): ITaskNode | null {
  const pending = pendingLeaves(nodes).filter((n) => n.id !== afterId);
  if (pending.length === 0) return null;
  const order = documentOrder(nodes);
  const pos = order.indexOf(afterId);
  if (pos < 0) return pending[0] ?? null;
  const after = pending.find((n) => order.indexOf(n.id) > pos);
  return after ?? pending[0] ?? null;
}

export interface VisibleRow {
  node: ITaskNode;
  depth: number;
}

/** Rows the outline shows, respecting collapsed nodes. Root depth = 1. */
export function flattenVisible(nodes: ITaskNode[], depth = 1, out: VisibleRow[] = []): VisibleRow[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (!n.collapsed) flattenVisible(n.subTasks, depth + 1, out);
  }
  return out;
}

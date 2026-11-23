// Workflow use-cases. The only module that combines storage, tree ops, and
// the chrome.alarms side effect. Every mutation goes through mutateWorkflow /
// mutateMeta (atomic across the side panel and the service worker), and
// every user string is validated here, at the boundary.

import { deleteWorkflow, getMeta, getWorkflow, listWorkflows, mutateMeta, mutateWorkflow, putWorkflows } from "./db";
import { clearTaskAlarm, scheduleTaskAlarm } from "./alarms";
import { normalizeWorkflow } from "./normalize";
import { buildSavePoint, pushCapped, type SavePointInput } from "./savePoints";
import {
  countNodes,
  depthOf,
  findTaskNode,
  indentNode,
  insertNode,
  mapSubtree,
  moveNode,
  nextPendingTask,
  outdentNode,
  removeNode,
  updateNode,
  walk,
} from "./taskTree";
import type { IAppMeta, IInboxItem, IMicroNote, ITaskNode, IWorkflowState, NoteKind } from "./types";
import {
  LIMITS,
  validateDomain,
  validateGracePeriod,
  validateInboxText,
  validateNoteContent,
  validateTaskTitle,
  validateWorkflowName,
} from "./validators";
import { isRestorableUrl } from "./savePoints";
import { countOutline, outlineHeight, type OutlineItem } from "./outline";

export type OrionErrorCode =
  | "invalid-input"
  | "not-found"
  | "max-nodes"
  | "max-depth"
  | "max-inbox"
  | "open-children"
  | "invalid-backup";

/** Expected, user-facing failures. The UI shows `message` as-is. */
export class OrionError extends Error {
  constructor(public readonly code: OrionErrorCode, message: string) {
    super(message);
    this.name = "OrionError";
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function requireValid<T>(value: T | null, message: string): T {
  if (value === null) throw new OrionError("invalid-input", message);
  return value;
}

function requireNode(wf: IWorkflowState, id: string): ITaskNode {
  const node = findTaskNode(wf.rootNodes, id);
  if (!node) throw new OrionError("not-found", "That task no longer exists.");
  return node;
}

function subtreeIds(node: ITaskNode): string[] {
  const ids: string[] = [];
  walk([node], (n) => ids.push(n.id));
  return ids;
}

async function clearAlarms(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => clearTaskAlarm(id)));
}

// ─── Workflows ─────────────────────────────────────────────────────────────

export async function createWorkflow(
  name: string,
  globalGracePeriodMins: number,
  blacklistedDomains: string[] = [],
  category?: string
): Promise<IWorkflowState> {
  const domains = [...new Set(blacklistedDomains.map(validateDomain).filter((d): d is string => d !== null))];
  const wf: IWorkflowState = {
    id: newId(),
    name: requireValid(validateWorkflowName(name), "Give the workflow a name (up to 120 characters)."),
    ...(category ? { category: category.slice(0, LIMITS.category) } : {}),
    createdAt: Date.now(),
    globalGracePeriodMins: validateGracePeriod(globalGracePeriodMins) ?? 5,
    blacklistedDomains: domains.slice(0, LIMITS.maxDomains),
    rootNodes: [],
    inbox: [],
  };
  await putWorkflows([wf]);
  return wf;
}

export async function deleteWorkflowCascade(workflowId: string): Promise<void> {
  const wf = await getWorkflow(workflowId);
  if (wf) {
    const ids: string[] = [];
    walk(wf.rootNodes, (n) => ids.push(n.id));
    await clearAlarms(ids);
  }
  await mutateMeta((m) =>
    m.activeWorkflowId === workflowId ? { ...m, activeWorkflowId: null, currentActiveNodeId: null, blacklistedSince: null } : m
  );
  await deleteWorkflow(workflowId);
}

// ─── Tasks: structure ──────────────────────────────────────────────────────

export interface AddTaskOptions {
  allocatedTimeMs?: number | null;
  targetUrl?: string | null;
  /** Position among siblings; default end. */
  index?: number;
}

function assertCanAdd(state: IWorkflowState, parentId: string | null, extraNodes = 1, extraHeight = 1): void {
  if (countNodes(state.rootNodes) + extraNodes > LIMITS.maxNodes) {
    throw new OrionError("max-nodes", `A workflow can hold up to ${LIMITS.maxNodes} tasks.`);
  }
  if (parentId !== null) {
    const parentDepth = depthOf(state.rootNodes, parentId);
    if (parentDepth === 0) throw new OrionError("not-found", "The parent task no longer exists.");
    if (parentDepth + extraHeight > LIMITS.maxDepth) {
      throw new OrionError("max-depth", `Tasks can nest up to ${LIMITS.maxDepth} levels.`);
    }
  }
}

export async function addTask(
  workflowId: string,
  parentId: string | null,
  title: string,
  options: AddTaskOptions = {}
): Promise<ITaskNode> {
  const validTitle = requireValid(validateTaskTitle(title), "Task titles need 1–200 characters.");
  const ms = options.allocatedTimeMs;
  const newTask: ITaskNode = {
    id: newId(),
    parentId,
    title: validTitle,
    status: "PENDING",
    allocatedTimeMs: typeof ms === "number" && ms > 0 ? ms : null,
    timeRemainingMs: typeof ms === "number" && ms > 0 ? ms : null,
    startedAt: null,
    completedAt: null,
    targetUrl: isRestorableUrl(options.targetUrl) ? options.targetUrl : null,
    isMilestone: false,
    collapsed: false,
    microNotes: [],
    savePoints: [],
    subTasks: [],
  };

  await mutateWorkflow(workflowId, (state) => {
    assertCanAdd(state, parentId);
    // Adding a child to a collapsed parent would hide what you just typed.
    const expanded = parentId ? updateNode(state.rootNodes, parentId, (p) => ({ ...p, collapsed: false })) : state.rootNodes;
    return { ...state, rootNodes: insertNode(expanded, parentId, newTask, options.index) };
  });
  return newTask;
}

/** Adds a whole pasted outline under parentId in one atomic write. Returns ids of the new top-level items. */
export async function addOutline(workflowId: string, parentId: string | null, items: OutlineItem[]): Promise<string[]> {
  if (!items.length) return [];
  const build = (item: OutlineItem, parent: string | null): ITaskNode => {
    const id = newId();
    return {
      id,
      parentId: parent,
      title: item.title,
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
      subTasks: item.children.map((c) => build(c, id)),
    };
  };
  const nodes = items.map((i) => build(i, parentId));
  await mutateWorkflow(workflowId, (s) => {
    assertCanAdd(s, parentId, countOutline(items), outlineHeight(items));
    let roots = parentId ? updateNode(s.rootNodes, parentId, (p) => ({ ...p, collapsed: false })) : s.rootNodes;
    for (const n of nodes) roots = insertNode(roots, parentId, n);
    return { ...s, rootNodes: roots };
  });
  return nodes.map((n) => n.id);
}

export async function renameTask(workflowId: string, taskId: string, title: string): Promise<void> {
  const valid = requireValid(validateTaskTitle(title), "Task titles need 1–200 characters.");
  await mutateWorkflow(workflowId, (s) => {
    requireNode(s, taskId);
    return { ...s, rootNodes: updateNode(s.rootNodes, taskId, (n) => ({ ...n, title: valid })) };
  });
}

/** Returns false when the move wasn't possible (edge, root, or depth limit). */
export async function indentTask(workflowId: string, taskId: string): Promise<boolean> {
  let changed = false;
  await mutateWorkflow(workflowId, (s) => {
    const next = indentNode(s.rootNodes, taskId);
    changed = next !== s.rootNodes;
    return changed ? { ...s, rootNodes: next } : s;
  });
  return changed;
}

export async function outdentTask(workflowId: string, taskId: string): Promise<boolean> {
  let changed = false;
  await mutateWorkflow(workflowId, (s) => {
    const next = outdentNode(s.rootNodes, taskId);
    changed = next !== s.rootNodes;
    return changed ? { ...s, rootNodes: next } : s;
  });
  return changed;
}

export async function moveTask(workflowId: string, taskId: string, dir: -1 | 1): Promise<boolean> {
  let changed = false;
  await mutateWorkflow(workflowId, (s) => {
    const next = moveNode(s.rootNodes, taskId, dir);
    changed = next !== s.rootNodes;
    return changed ? { ...s, rootNodes: next } : s;
  });
  return changed;
}

/** Sets or clears a timebox. If the task is running, its alarm restarts from now. */
export async function setTaskTimer(workflowId: string, taskId: string, minutes: number | null): Promise<void> {
  const ms = minutes && minutes > 0 ? Math.min(Math.round(minutes), 24 * 60) * 60_000 : null;
  const now = Date.now();
  const updated = await mutateWorkflow(workflowId, (s) => {
    requireNode(s, taskId);
    return {
      ...s,
      rootNodes: updateNode(s.rootNodes, taskId, (n) => ({
        ...n,
        allocatedTimeMs: ms,
        timeRemainingMs: ms,
        startedAt: n.status === "ACTIVE" ? now : n.startedAt,
      })),
    };
  });
  const task = findTaskNode(updated.rootNodes, taskId);
  await clearTaskAlarm(taskId);
  if (task?.status === "ACTIVE") await scheduleTaskAlarm(task);
}

export async function toggleMilestone(workflowId: string, taskId: string): Promise<void> {
  await mutateWorkflow(workflowId, (s) => ({
    ...s,
    rootNodes: updateNode(s.rootNodes, taskId, (n) => ({ ...n, isMilestone: !n.isMilestone })),
  }));
}

export async function setCollapsed(workflowId: string, taskId: string, collapsed: boolean): Promise<void> {
  await mutateWorkflow(workflowId, (s) => ({
    ...s,
    rootNodes: updateNode(s.rootNodes, taskId, (n) => (n.collapsed === collapsed ? n : { ...n, collapsed })),
  }));
}

export interface RemovedTask {
  node: ITaskNode;
  parentId: string | null;
  index: number;
}

export async function deleteTask(workflowId: string, taskId: string): Promise<RemovedTask> {
  let removed: RemovedTask | null = null;
  await mutateWorkflow(workflowId, (s) => {
    const r = removeNode(s.rootNodes, taskId);
    if (!r.removed) throw new OrionError("not-found", "That task no longer exists.");
    removed = { node: r.removed, parentId: r.parentId, index: r.index };
    return { ...s, rootNodes: r.nodes };
  });
  const result = removed as RemovedTask | null;
  if (!result) throw new OrionError("not-found", "That task no longer exists.");
  const ids = subtreeIds(result.node);
  await clearAlarms(ids);
  await mutateMeta((m) =>
    m.currentActiveNodeId && ids.includes(m.currentActiveNodeId) ? { ...m, currentActiveNodeId: null } : m
  );
  return result;
}

/** Undo for deleteTask. Restored tasks come back PENDING (never ACTIVE). */
export async function restoreTask(workflowId: string, removed: RemovedTask): Promise<void> {
  const node = mapSubtree(removed.node, (n) => (n.status === "ACTIVE" ? { ...n, status: "PENDING" } : n));
  await mutateWorkflow(workflowId, (s) => {
    const parentExists = removed.parentId !== null && depthOf(s.rootNodes, removed.parentId) > 0;
    const parentId = parentExists ? removed.parentId : null;
    assertCanAdd(s, parentId, subtreeIds(node).length, 1);
    return { ...s, rootNodes: insertNode(s.rootNodes, parentId, node, parentExists ? removed.index : undefined) };
  });
}

// ─── Tasks: status, switching, save points ─────────────────────────────────

/**
 * Records a save point on taskId (newest first, capped). Used for manual
 * saves and idle auto-saves.
 */
export async function recordSavePoint(workflowId: string, taskId: string, capture: SavePointInput): Promise<void> {
  const sp = buildSavePoint(capture, Date.now(), newId());
  await mutateWorkflow(workflowId, (s) => {
    requireNode(s, taskId);
    return {
      ...s,
      rootNodes: updateNode(s.rootNodes, taskId, (n) => ({ ...n, savePoints: pushCapped(n.savePoints, sp, LIMITS.savePoints) })),
    };
  });
}

/**
 * Moves focus to toTaskId (or to nothing). Whatever was ACTIVE goes back to
 * PENDING with a save point holding `capture` (next step + tabs), so the
 * user can come back to it later. Exactly one ACTIVE node remains.
 */
export async function switchTask(
  workflowId: string,
  toTaskId: string | null,
  capture: SavePointInput = { trigger: "switch" }
): Promise<IWorkflowState> {
  const now = Date.now();
  const outgoing: string[] = [];
  let saved = false;

  const updated = await mutateWorkflow(workflowId, (s) => {
    if (toTaskId) requireNode(s, toTaskId);
    let nodes = s.rootNodes;
    walk(s.rootNodes, (n) => {
      if (n.status === "ACTIVE" && n.id !== toTaskId) outgoing.push(n.id);
    });
    for (const id of outgoing) {
      nodes = updateNode(nodes, id, (n) => {
        const withSave = saved
          ? n
          : { ...n, savePoints: pushCapped(n.savePoints, buildSavePoint(capture, now, newId()), LIMITS.savePoints) };
        saved = true;
        return { ...withSave, status: "PENDING" };
      });
    }
    if (toTaskId) {
      nodes = updateNode(nodes, toTaskId, (n) =>
        n.status === "ACTIVE" ? n : { ...n, status: "ACTIVE", startedAt: now, completedAt: null }
      );
    }
    return { ...s, rootNodes: nodes };
  });

  await clearAlarms(outgoing);
  if (toTaskId) {
    const task = findTaskNode(updated.rootNodes, toTaskId);
    if (task) await scheduleTaskAlarm(task);
  }
  await mutateMeta((m) => ({
    ...m,
    activeWorkflowId: workflowId,
    currentActiveNodeId: toTaskId,
    lastActiveTimestamp: now,
    blacklistedSince: null,
  }));
  return updated;
}

/** Starts (or resumes) a workflow on taskId, pausing any other active workflow first. */
export async function startWorkflow(workflowId: string, firstTaskId: string): Promise<void> {
  const meta = await getMeta();
  if (meta.activeWorkflowId && meta.activeWorkflowId !== workflowId) {
    const other = await getWorkflow(meta.activeWorkflowId);
    if (other) await switchTask(other.id, null, { trigger: "switch" });
  }
  await switchTask(workflowId, firstTaskId, { trigger: "switch" });
}

/** Pauses the active workflow, saving where you were. */
export async function stopWorkflow(capture: SavePointInput = { trigger: "stop" }): Promise<void> {
  const meta = await getMeta();
  if (meta.activeWorkflowId && (await getWorkflow(meta.activeWorkflowId))) {
    await switchTask(meta.activeWorkflowId, null, capture);
  }
  await mutateMeta((m) => ({ ...m, activeWorkflowId: null, currentActiveNodeId: null, blacklistedSince: null }));
}

export interface CompleteResult {
  /** Suggested next task (first pending leaf after this one). */
  nextTaskId: string | null;
  /** Parent whose children are now all done, so it can be completed too. */
  parentReadyId: string | null;
}

export async function completeTask(
  workflowId: string,
  taskId: string,
  options: { cascade?: boolean } = {}
): Promise<CompleteResult> {
  const now = Date.now();
  let affected: string[] = [];
  const updated = await mutateWorkflow(workflowId, (s) => {
    const node = requireNode(s, taskId);
    const open: string[] = [];
    walk(node.subTasks, (n) => {
      if (n.status !== "DONE") open.push(n.id);
    });
    if (open.length && !options.cascade) {
      throw new OrionError("open-children", `${open.length} subtask${open.length === 1 ? " is" : "s are"} still open.`);
    }
    affected = subtreeIds(node);
    return {
      ...s,
      rootNodes: updateNode(s.rootNodes, taskId, (n) =>
        mapSubtree(n, (c) => (c.status === "DONE" ? c : { ...c, status: "DONE", completedAt: now }))
      ),
    };
  });

  await clearAlarms(affected);
  await mutateMeta((m) =>
    m.activeWorkflowId === workflowId && m.currentActiveNodeId && affected.includes(m.currentActiveNodeId)
      ? { ...m, currentActiveNodeId: null }
      : m
  );

  const done = findTaskNode(updated.rootNodes, taskId);
  const parent = done?.parentId ? findTaskNode(updated.rootNodes, done.parentId) : undefined;
  const parentReadyId =
    parent && parent.status !== "DONE" && parent.subTasks.every((c) => c.status === "DONE") ? parent.id : null;
  return { nextTaskId: nextPendingTask(updated.rootNodes, taskId)?.id ?? null, parentReadyId };
}

export async function reopenTask(workflowId: string, taskId: string): Promise<void> {
  await mutateWorkflow(workflowId, (s) => ({
    ...s,
    rootNodes: updateNode(s.rootNodes, taskId, (n) =>
      n.status === "DONE" ? { ...n, status: "PENDING", completedAt: null } : n
    ),
  }));
}

// ─── Notes and decisions ───────────────────────────────────────────────────

export async function addNote(
  workflowId: string,
  taskId: string,
  content: string,
  kind: NoteKind = "note",
  sourceUrl: string | null = null
): Promise<IMicroNote> {
  const note: IMicroNote = {
    id: newId(),
    content: requireValid(validateNoteContent(content), "Notes need 1–500 characters."),
    timestamp: Date.now(),
    isActionableCommand: content.trim().startsWith("!"),
    kind,
    sourceUrl: isRestorableUrl(sourceUrl) ? sourceUrl : null,
  };
  await mutateWorkflow(workflowId, (s) => {
    requireNode(s, taskId);
    return {
      ...s,
      rootNodes: updateNode(s.rootNodes, taskId, (n) => ({
        ...n,
        microNotes: [...n.microNotes, note].slice(-LIMITS.maxNotes),
      })),
    };
  });
  return note;
}

export interface RemovedNote {
  taskId: string;
  note: IMicroNote;
  index: number;
}

/** Deletes a note; returns what's needed to undo it (null if it was already gone). */
export async function deleteNote(workflowId: string, taskId: string, noteId: string): Promise<RemovedNote | null> {
  let removed: RemovedNote | null = null;
  await mutateWorkflow(workflowId, (s) => ({
    ...s,
    rootNodes: updateNode(s.rootNodes, taskId, (n) => {
      const index = n.microNotes.findIndex((x) => x.id === noteId);
      if (index < 0) return n;
      removed = { taskId, note: n.microNotes[index]!, index };
      return { ...n, microNotes: n.microNotes.filter((x) => x.id !== noteId) };
    }),
  }));
  return removed;
}

/** Undo for deleteNote: puts the same note back where it was. */
export async function restoreNote(workflowId: string, removed: RemovedNote): Promise<void> {
  await mutateWorkflow(workflowId, (s) => {
    requireNode(s, removed.taskId);
    return {
      ...s,
      rootNodes: updateNode(s.rootNodes, removed.taskId, (n) => {
        if (n.microNotes.some((x) => x.id === removed.note.id)) return n;
        const notes = [...n.microNotes];
        notes.splice(Math.min(removed.index, notes.length), 0, removed.note);
        return { ...n, microNotes: notes.slice(-LIMITS.maxNotes) };
      }),
    };
  });
}

// ─── Inbox (side quests) ───────────────────────────────────────────────────

export async function addInboxItem(
  workflowId: string,
  text: string,
  taskId: string | null = null,
  sourceUrl: string | null = null
): Promise<IInboxItem> {
  const item: IInboxItem = {
    id: newId(),
    text: requireValid(validateInboxText(text), "Inbox items need 1–500 characters."),
    createdAt: Date.now(),
    taskId,
    sourceUrl: isRestorableUrl(sourceUrl) ? sourceUrl : null,
  };
  await mutateWorkflow(workflowId, (s) => {
    if (s.inbox.length >= LIMITS.maxInbox) {
      throw new OrionError("max-inbox", `Inbox is full (${LIMITS.maxInbox}). Triage a few items first.`);
    }
    return { ...s, inbox: [item, ...s.inbox] };
  });
  return item;
}

export interface RemovedInboxItem {
  item: IInboxItem;
  index: number;
}

/** Dismisses an inbox item; returns what's needed to undo it (null if it was already gone). */
export async function dismissInboxItem(workflowId: string, itemId: string): Promise<RemovedInboxItem | null> {
  let removed: RemovedInboxItem | null = null;
  await mutateWorkflow(workflowId, (s) => {
    const index = s.inbox.findIndex((i) => i.id === itemId);
    if (index < 0) return s;
    removed = { item: s.inbox[index]!, index };
    return { ...s, inbox: s.inbox.filter((i) => i.id !== itemId) };
  });
  return removed;
}

/** Undo for dismissInboxItem. */
export async function restoreInboxItem(workflowId: string, removed: RemovedInboxItem): Promise<void> {
  await mutateWorkflow(workflowId, (s) => {
    if (s.inbox.some((i) => i.id === removed.item.id)) return s;
    if (s.inbox.length >= LIMITS.maxInbox) {
      throw new OrionError("max-inbox", `Inbox is full (${LIMITS.maxInbox}). Triage a few items first.`);
    }
    const inbox = [...s.inbox];
    inbox.splice(Math.min(removed.index, inbox.length), 0, removed.item);
    return { ...s, inbox };
  });
}

/** Turns an inbox item into a task under parentId (null = top level), atomically. */
export async function promoteInboxItem(workflowId: string, itemId: string, parentId: string | null): Promise<ITaskNode> {
  let created: ITaskNode | null = null;
  await mutateWorkflow(workflowId, (s) => {
    const item = s.inbox.find((i) => i.id === itemId);
    if (!item) throw new OrionError("not-found", "That inbox item is gone.");
    assertCanAdd(s, parentId);
    const node: ITaskNode = {
      id: newId(),
      parentId,
      title: item.text.slice(0, LIMITS.taskTitle),
      status: "PENDING",
      allocatedTimeMs: null,
      timeRemainingMs: null,
      startedAt: null,
      completedAt: null,
      targetUrl: item.sourceUrl,
      isMilestone: false,
      collapsed: false,
      microNotes: [],
      savePoints: [],
      subTasks: [],
    };
    created = node;
    return {
      ...s,
      inbox: s.inbox.filter((i) => i.id !== itemId),
      rootNodes: insertNode(s.rootNodes, parentId, node),
    };
  });
  return created as unknown as ITaskNode;
}

// ─── Meta helpers ──────────────────────────────────────────────────────────

export async function markResumeShown(now: number = Date.now()): Promise<IAppMeta> {
  return mutateMeta((m) => ({ ...m, lastResumeShownAt: now }));
}

// ─── Backup ────────────────────────────────────────────────────────────────

const BACKUP_APP = "OrionHUD";
const BACKUP_VERSION = 2;

export async function exportBackup(): Promise<string> {
  const workflows = await listWorkflows();
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), workflows }, null, 2);
}

/**
 * Validates the whole file before writing anything; one bad workflow
 * rejects the import. Existing workflows with the same id are replaced.
 */
export async function importBackup(json: string): Promise<{ imported: number }> {
  if (json.length > LIMITS.importBytes) throw new OrionError("invalid-backup", "Backup file is larger than 5 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new OrionError("invalid-backup", "That file isn't valid JSON.");
  }
  const rec = parsed as Record<string, unknown> | null;
  if (!rec || rec["app"] !== BACKUP_APP || !Array.isArray(rec["workflows"])) {
    throw new OrionError("invalid-backup", "That file isn't an OrionHUD backup.");
  }
  const raw = rec["workflows"] as unknown[];
  const workflows = raw.map(normalizeWorkflow);
  if (workflows.some((w) => w === null)) {
    throw new OrionError("invalid-backup", "The backup contains a damaged workflow, so nothing was imported.");
  }
  const valid = workflows as IWorkflowState[];
  // Imported tasks never come back ACTIVE: alarms/meta aren't part of a backup.
  const cleaned = valid.map((w) => ({
    ...w,
    rootNodes: w.rootNodes.map((n) => mapSubtree(n, (c) => (c.status === "ACTIVE" ? { ...c, status: "PENDING" as const } : c))),
  }));
  await putWorkflows(cleaned);
  return { imported: cleaned.length };
}

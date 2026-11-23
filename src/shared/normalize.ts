// Turns anything read from storage or an import file into a well-formed
// domain object, or null. Old (v0.1) data gets defaults for new fields;
// malformed pieces are dropped instead of crashing the UI.
//
// This is the trust boundary for persisted data: the rest of the code may
// assume normalized shapes.

import type {
  IAppMeta,
  IInboxItem,
  ILiveTabs,
  IMicroNote,
  ISavePoint,
  ISavedTab,
  ITaskNode,
  IWorkflowState,
  NodeStatus,
  SavePointTrigger,
  TabsSource,
} from "./types";
import { LIMITS } from "./validators";
import { classifyUrl, isRestorableUrl } from "./savePoints";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.slice(0, max) : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const STATUSES: NodeStatus[] = ["PENDING", "ACTIVE", "DONE", "SNOOZED"];
const TRIGGERS: SavePointTrigger[] = ["switch", "idle", "manual", "stop", "complete", "restart"];
const SOURCES: TabsSource[] = ["window", "active", "none"];

function normalizeNote(raw: unknown): IMicroNote | null {
  if (!isRec(raw)) return null;
  const id = str(raw["id"], 100);
  const content = str(raw["content"], LIMITS.noteContent);
  if (!id || !content) return null;
  return {
    id,
    content,
    timestamp: num(raw["timestamp"]) ?? 0,
    isActionableCommand: raw["isActionableCommand"] === true,
    kind: raw["kind"] === "decision" ? "decision" : "note",
    sourceUrl: isRestorableUrl(raw["sourceUrl"]) ? raw["sourceUrl"] : null,
  };
}

function normalizeTab(raw: unknown): ISavedTab | null {
  if (!isRec(raw) || !isRestorableUrl(raw["url"])) return null;
  const url = raw["url"];
  // Re-derive classification instead of trusting the stored one.
  const { kind, vendor } = classifyUrl(url);
  return { url, title: str(raw["title"], LIMITS.tabTitle) ?? url, kind, vendor };
}

function normalizeSavePoint(raw: unknown): ISavePoint | null {
  if (!isRec(raw)) return null;
  const id = str(raw["id"], 100);
  const createdAt = num(raw["createdAt"]);
  if (!id || createdAt === null) return null;
  const tabs = arr(raw["tabs"])
    .map(normalizeTab)
    .filter((t): t is ISavedTab => t !== null)
    .slice(0, LIMITS.savedTabs);
  const trigger = TRIGGERS.find((t) => t === raw["trigger"]) ?? "manual";
  const source = SOURCES.find((s) => s === raw["tabsSource"]) ?? "none";
  return {
    id,
    createdAt,
    trigger,
    nextStep: str(raw["nextStep"], LIMITS.nextStep),
    tabs,
    tabsSource: tabs.length ? source : "none",
  };
}

interface NodeBudget {
  remaining: number;
  seen: Set<string>;
}

function normalizeNode(raw: unknown, parentId: string | null, depth: number, budget: NodeBudget): ITaskNode | null {
  if (!isRec(raw) || budget.remaining <= 0) return null;
  const id = str(raw["id"], 100);
  const title = str(raw["title"], LIMITS.taskTitle);
  // Duplicate ids would make every id-based edit ambiguous.
  if (!id || !title || budget.seen.has(id)) return null;
  budget.seen.add(id);
  budget.remaining -= 1;

  const subTasks =
    depth >= LIMITS.maxDepth
      ? []
      : arr(raw["subTasks"])
          .map((c) => normalizeNode(c, id, depth + 1, budget))
          .filter((n): n is ITaskNode => n !== null);

  return {
    id,
    parentId,
    title,
    status: STATUSES.find((s) => s === raw["status"]) ?? "PENDING",
    allocatedTimeMs: num(raw["allocatedTimeMs"]),
    timeRemainingMs: num(raw["timeRemainingMs"]),
    startedAt: num(raw["startedAt"]),
    completedAt: num(raw["completedAt"]),
    targetUrl: isRestorableUrl(raw["targetUrl"]) ? raw["targetUrl"] : null,
    isMilestone: raw["isMilestone"] === true,
    collapsed: raw["collapsed"] === true,
    microNotes: arr(raw["microNotes"])
      .map(normalizeNote)
      .filter((n): n is IMicroNote => n !== null)
      .slice(-LIMITS.maxNotes),
    savePoints: arr(raw["savePoints"])
      .map(normalizeSavePoint)
      .filter((s): s is ISavePoint => s !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LIMITS.savePoints),
    subTasks,
  };
}

function normalizeInboxItem(raw: unknown): IInboxItem | null {
  if (!isRec(raw)) return null;
  const id = str(raw["id"], 100);
  const text = str(raw["text"], LIMITS.inboxText);
  if (!id || !text) return null;
  return {
    id,
    text,
    createdAt: num(raw["createdAt"]) ?? 0,
    taskId: str(raw["taskId"], 100),
    sourceUrl: isRestorableUrl(raw["sourceUrl"]) ? raw["sourceUrl"] : null,
  };
}

export function normalizeWorkflow(raw: unknown): IWorkflowState | null {
  if (!isRec(raw)) return null;
  const id = str(raw["id"], 100);
  const name = str(raw["name"], LIMITS.workflowName);
  const grace = num(raw["globalGracePeriodMins"]);
  if (!id || !name || grace === null) return null;

  const budget: NodeBudget = { remaining: LIMITS.maxNodes, seen: new Set() };
  const rootNodes = arr(raw["rootNodes"])
    .map((n) => normalizeNode(n, null, 1, budget))
    .filter((n): n is ITaskNode => n !== null);

  const category = str(raw["category"], LIMITS.category);
  return {
    id,
    name,
    ...(category ? { category } : {}),
    createdAt: num(raw["createdAt"]) ?? 0,
    globalGracePeriodMins: Math.min(Math.max(Math.round(grace), LIMITS.graceMins.min), LIMITS.graceMins.max),
    blacklistedDomains: arr(raw["blacklistedDomains"])
      .filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= LIMITS.domain)
      .slice(0, LIMITS.maxDomains),
    rootNodes,
    inbox: arr(raw["inbox"])
      .map(normalizeInboxItem)
      .filter((i): i is IInboxItem => i !== null)
      .slice(0, LIMITS.maxInbox),
  };
}

export function normalizeLiveTabs(raw: unknown): ILiveTabs | null {
  if (!isRec(raw)) return null;
  const workflowId = str(raw["workflowId"], 100);
  const taskId = str(raw["taskId"], 100);
  const updatedAt = num(raw["updatedAt"]);
  if (!workflowId || !taskId || updatedAt === null) return null;
  const tabs = arr(raw["tabs"])
    .map(normalizeTab)
    .filter((t): t is ISavedTab => t !== null)
    .slice(0, LIMITS.savedTabs);
  return { workflowId, taskId, tabs, updatedAt };
}

export function normalizeMeta(raw: unknown, now: number): IAppMeta {
  const r = isRec(raw) ? raw : {};
  return {
    activeWorkflowId: str(r["activeWorkflowId"], 100),
    currentActiveNodeId: str(r["currentActiveNodeId"], 100),
    lastActiveTimestamp: num(r["lastActiveTimestamp"]) ?? now,
    blacklistedSince: num(r["blacklistedSince"]),
    lastResumeShownAt: num(r["lastResumeShownAt"]),
  };
}

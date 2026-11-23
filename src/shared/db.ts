import { openDB, type IDBPDatabase } from "idb";
import type { IAppMeta, IWorkflowState, ITaskNode } from "./types";

const DB_NAME = "orion-hud";
const DB_VERSION = 1;
const META_KEY = "meta";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("workflows")) {
          db.createObjectStore("workflows", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

// --- Per-key async lock -----------------------------------------------
//
// IndexedDB transactions are atomic, but a read-modify-write sequence
// (get workflow, mutate the JS object, put it back) is NOT atomic across
// two concurrent callers. Two notes added to the same workflow within
// the same tick can silently overwrite one another. This lock forces
// read-modify-write sequences against the same key to run one at a time,
// even when called concurrently, without blocking unrelated keys.

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  const settledPrior = prior.catch(() => undefined);
  const run = settledPrior.then(fn);
  locks.set(key, run.catch(() => undefined));
  return run;
}

// --- Workflow state (structural, always written immediately) ----------

// ─── Runtime type guards ─────────────────────────────────────────────────
// Replace blind `as Type` casts so that schema changes between extension
// versions produce a safe default rather than a silent runtime crash.

function parseMeta(raw: unknown): IAppMeta {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_META, lastActiveTimestamp: Date.now() };
  const r = raw as Record<string, unknown>;
  return {
    activeWorkflowId:
      typeof r["activeWorkflowId"] === "string" ? r["activeWorkflowId"] : null,
    currentActiveNodeId:
      typeof r["currentActiveNodeId"] === "string" ? r["currentActiveNodeId"] : null,
    lastActiveTimestamp:
      typeof r["lastActiveTimestamp"] === "number"
        ? r["lastActiveTimestamp"]
        : Date.now(),
    blacklistedSince:
      typeof r["blacklistedSince"] === "number" ? r["blacklistedSince"] : null,
  };
}

function parseWorkflow(raw: unknown): IWorkflowState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["id"] !== "string" || !r["id"]) return null;
  if (typeof r["name"] !== "string" || !r["name"]) return null;
  if (typeof r["globalGracePeriodMins"] !== "number") return null;
  // rootNodes and blacklistedDomains: trust if present, default to [] if not.
  // Deep node validation is prohibitively expensive for nested trees; the
  // app only writes nodes through mutateWorkflow which already validates via TS.
  return {
    id: r["id"],
    name: r["name"],
    category: typeof r["category"] === "string" ? r["category"] : undefined,
    globalGracePeriodMins: r["globalGracePeriodMins"],
    blacklistedDomains: Array.isArray(r["blacklistedDomains"])
      ? (r["blacklistedDomains"] as string[]).filter((d) => typeof d === "string")
      : [],
    rootNodes: Array.isArray(r["rootNodes"]) ? (r["rootNodes"] as ITaskNode[]) : [],
  };
}

export async function getWorkflow(
  id: string
): Promise<IWorkflowState | undefined> {
  const db = await getDB();
  const raw = await db.get("workflows", id);
  const parsed = parseWorkflow(raw);
  return parsed ?? undefined;
}

export async function listWorkflowIds(): Promise<string[]> {
  const db = await getDB();
  return db.getAllKeys("workflows") as Promise<string[]>;
}

export async function commitWorkflow(state: IWorkflowState): Promise<void> {
  await withLock(`workflow:${state.id}`, async () => {
    const db = await getDB();
    await db.put("workflows", state);
  });
}

// Read-modify-write helper. The lock guarantees `current` reflects the
// most recent committed state even if two callers invoke this for the
// same id at nearly the same time.
export async function mutateWorkflow(
  id: string,
  mutator: (state: IWorkflowState) => IWorkflowState
): Promise<IWorkflowState> {
  return withLock(`workflow:${id}`, async () => {
    const db = await getDB();
    const current = (await db.get("workflows", id)) as
      | IWorkflowState
      | undefined;
    if (!current) {
      throw new Error(`Workflow ${id} not found`);
    }
    const next = mutator(current);
    await db.put("workflows", next);
    return next;
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await withLock(`workflow:${id}`, async () => {
    const db = await getDB();
    await db.delete("workflows", id);
  });
}

// --- App meta (small, high-frequency) ----------------------------------

const DEFAULT_META: IAppMeta = {
  activeWorkflowId: null,
  currentActiveNodeId: null,
  lastActiveTimestamp: Date.now(),
  blacklistedSince: null,
};

export async function getMeta(): Promise<IAppMeta> {
  const db = await getDB();
  const raw = await db.get("meta", META_KEY);
  return parseMeta(raw);
}

// Always available for anything structural about meta (e.g. switching
// the active workflow), never debounced.
export async function commitMeta(meta: IAppMeta): Promise<void> {
  const db = await getDB();
  await db.put("meta", meta, META_KEY);
}

// Throttled path, ONLY for high-frequency fields that are safe to lose a
// few hundred milliseconds of (e.g. a countdown timer redrawing every
// second). If the service worker dies before this fires, the worst case
// is a slightly stale timeRemainingMs on next read, which gets
// recomputed from startedAt/allocatedTimeMs anyway, never use this for
// activeWorkflowId or currentActiveNodeId changes.
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMeta: IAppMeta | null = null;

export function commitMetaThrottled(meta: IAppMeta, throttleMs = 250): void {
  pendingMeta = meta;
  if (throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    const toWrite = pendingMeta;
    pendingMeta = null;
    if (toWrite) void commitMeta(toWrite);
  }, throttleMs);
}

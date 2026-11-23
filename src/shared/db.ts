import { openDB, type IDBPDatabase } from "idb";
import type { IAppMeta, ILiveTabs, IWorkflowState } from "./types";
import { normalizeLiveTabs, normalizeMeta, normalizeWorkflow } from "./normalize";

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
      // Another context (e.g. a newer extension version) wants to upgrade:
      // let it, and reconnect lazily on the next call.
      blocking() {
        void dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    }).catch((err: unknown) => {
      dbPromise = null; // don't cache a failed open forever
      throw err;
    });
  }
  return dbPromise;
}

// --- Atomic read-modify-write ------------------------------------------
//
// The side panel and the service worker are separate JS contexts with
// separate memory, so an in-memory lock can't stop them overwriting each
// other's writes. IndexedDB can: readwrite transactions on the same store
// are serialized by the browser across every connection. So each mutation
// does its get + put inside ONE transaction, with a synchronous mutator
// (an await on anything else would let the transaction auto-commit early).

function abortQuietly(tx: { abort(): void; done: Promise<void> }): void {
  // done rejects with AbortError once we abort; that's expected, not a bug.
  tx.done.catch(() => undefined);
  try {
    tx.abort();
  } catch {
    /* already finished */
  }
}

export async function mutateWorkflow(
  id: string,
  mutator: (state: IWorkflowState) => IWorkflowState
): Promise<IWorkflowState> {
  const db = await getDB();
  const tx = db.transaction("workflows", "readwrite");
  try {
    const current = normalizeWorkflow(await tx.store.get(id));
    if (!current) throw new Error(`Workflow ${id} not found`);
    const next = mutator(current);
    await tx.store.put(next);
    await tx.done;
    return next;
  } catch (err) {
    abortQuietly(tx);
    throw err;
  }
}

export async function mutateMeta(mutator: (meta: IAppMeta) => IAppMeta): Promise<IAppMeta> {
  const db = await getDB();
  const tx = db.transaction("meta", "readwrite");
  try {
    const current = normalizeMeta(await tx.store.get(META_KEY), Date.now());
    const next = mutator(current);
    await tx.store.put(next, META_KEY);
    await tx.done;
    return next;
  } catch (err) {
    abortQuietly(tx);
    throw err;
  }
}

// --- Plain reads/writes -------------------------------------------------

export async function getWorkflow(id: string): Promise<IWorkflowState | undefined> {
  const db = await getDB();
  return normalizeWorkflow(await db.get("workflows", id)) ?? undefined;
}

export async function listWorkflowIds(): Promise<string[]> {
  const db = await getDB();
  return (await db.getAllKeys("workflows")).filter((k): k is string => typeof k === "string");
}

/** All workflows, newest first. Unreadable records are skipped, not fatal. */
export async function listWorkflows(): Promise<IWorkflowState[]> {
  const db = await getDB();
  return (await db.getAll("workflows"))
    .map(normalizeWorkflow)
    .filter((w): w is IWorkflowState => w !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function commitWorkflow(state: IWorkflowState): Promise<void> {
  const db = await getDB();
  await db.put("workflows", state);
}

/** All-or-nothing bulk write (import). */
export async function putWorkflows(list: IWorkflowState[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("workflows", "readwrite");
  for (const wf of list) void tx.store.put(wf);
  await tx.done;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("workflows", id);
}

export async function getMeta(): Promise<IAppMeta> {
  const db = await getDB();
  return normalizeMeta(await db.get("meta", META_KEY), Date.now());
}

/** Whole-object write. Prefer mutateMeta when other fields may be changing concurrently. */
export async function commitMeta(meta: IAppMeta): Promise<void> {
  const db = await getDB();
  await db.put("meta", meta, META_KEY);
}

const LIVE_TABS_KEY = "liveTabs";

export async function getLiveTabs(): Promise<ILiveTabs | null> {
  const db = await getDB();
  return normalizeLiveTabs(await db.get("meta", LIVE_TABS_KEY));
}

export async function setLiveTabs(live: ILiveTabs | null): Promise<void> {
  const db = await getDB();
  if (live) await db.put("meta", live, LIVE_TABS_KEY);
  else await db.delete("meta", LIVE_TABS_KEY);
}

/** Test-only: drop the cached connection so a fresh one is opened. */
export function __resetConnectionForTests(): void {
  void dbPromise?.then((db) => db.close());
  dbPromise = null;
}

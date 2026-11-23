import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeAlarmsMock } from "./chromeMock";
import {
  OrionError,
  addInboxItem,
  addOutline,
  addNote,
  addTask,
  completeTask,
  createWorkflow,
  deleteNote,
  deleteTask,
  dismissInboxItem,
  exportBackup,
  importBackup,
  indentTask,
  promoteInboxItem,
  recordSavePoint,
  restoreInboxItem,
  restoreNote,
  restoreTask,
  startWorkflow,
  stopWorkflow,
  switchTask,
} from "../src/shared/workflowActions";
import { getMeta, getWorkflow, listWorkflows, mutateMeta } from "../src/shared/db";
import { findTaskNode, walk } from "../src/shared/taskTree";
import type { IWorkflowState } from "../src/shared/types";
import { ids } from "./fixtures";
import { parseOutline } from "../src/shared/outline";

async function wf(id: string): Promise<IWorkflowState> {
  const w = await getWorkflow(id);
  if (!w) throw new Error("missing workflow");
  return w;
}

function activeIds(w: IWorkflowState): string[] {
  const out: string[] = [];
  walk(w.rootNodes, (n) => {
    if (n.status === "ACTIVE") out.push(n.id);
  });
  return out;
}

describe("workflow orchestration", () => {
  let alarms: ReturnType<typeof installChromeAlarmsMock>;

  beforeEach(async () => {
    alarms = installChromeAlarmsMock();
    await mutateMeta((m) => ({ ...m, activeWorkflowId: null, currentActiveNodeId: null, lastResumeShownAt: null }));
  });

  it("creates a workflow, validating name and domains", async () => {
    const w = await createWorkflow("Deploy", 5, ["slack.com", "not a domain", "slack.com"]);
    expect(w.rootNodes).toEqual([]);
    expect(w.inbox).toEqual([]);
    expect(w.blacklistedDomains).toEqual(["slack.com"]);
    await expect(createWorkflow("   ", 5)).rejects.toBeInstanceOf(OrionError);
  });

  it("adds a task at the root and a nested subtask", async () => {
    const w = await createWorkflow("Deploy", 5);
    const root = await addTask(w.id, null, "Build image", { allocatedTimeMs: 8 * 60_000 });
    const child = await addTask(w.id, root.id, "Push to registry");
    const updated = await wf(w.id);
    expect(updated.rootNodes[0]?.subTasks[0]?.title).toBe("Push to registry");
    expect(child.parentId).toBe(root.id);
  });

  it("refuses to nest deeper than 8 levels", async () => {
    const w = await createWorkflow("Deep", 5);
    let parent: string | null = null;
    for (let i = 1; i <= 8; i++) parent = (await addTask(w.id, parent, `L${i}`)).id;
    await expect(addTask(w.id, parent, "L9")).rejects.toMatchObject({ code: "max-depth" });
  });

  it("starting marks the task ACTIVE, schedules its alarm, and sets meta", async () => {
    const w = await createWorkflow("Deploy", 5);
    const task = await addTask(w.id, null, "Build image", { allocatedTimeMs: 8 * 60_000 });
    await startWorkflow(w.id, task.id);

    const found = findTaskNode((await wf(w.id)).rootNodes, task.id);
    expect(found?.status).toBe("ACTIVE");
    expect(alarms.create).toHaveBeenCalledWith(`orion-task:${task.id}`, expect.objectContaining({ delayInMinutes: 8 }));
    const meta = await getMeta();
    expect(meta.activeWorkflowId).toBe(w.id);
    expect(meta.currentActiveNodeId).toBe(task.id);
  });

  it("a task without a timer schedules no alarm", async () => {
    const w = await createWorkflow("Deploy", 5);
    const task = await addTask(w.id, null, "Manual review");
    await startWorkflow(w.id, task.id);
    expect(alarms.create).not.toHaveBeenCalled();
  });

  it("switchTask leaves exactly one ACTIVE and saves the outgoing task", async () => {
    const w = await createWorkflow("Auth", 5);
    const a = await addTask(w.id, null, "A", { allocatedTimeMs: 5 * 60_000 });
    const b = await addTask(w.id, null, "B");
    await startWorkflow(w.id, a.id);

    const tab = { url: "https://claude.ai/chat/1", title: "t", kind: "ai-thread" as const, vendor: "Claude" };
    await switchTask(w.id, b.id, { trigger: "switch", nextStep: "write the test", tabs: [tab], tabsSource: "window" });

    const after = await wf(w.id);
    expect(activeIds(after)).toEqual([b.id]);
    const outgoing = findTaskNode(after.rootNodes, a.id)!;
    expect(outgoing.status).toBe("PENDING");
    expect(outgoing.savePoints[0]).toMatchObject({ trigger: "switch", nextStep: "write the test", tabs: [tab] });
    expect(alarms.clear).toHaveBeenCalledWith(`orion-task:${a.id}`);
    expect((await getMeta()).currentActiveNodeId).toBe(b.id);
  });

  it("starting another workflow pauses the first one with a save point", async () => {
    const w1 = await createWorkflow("One", 5);
    const t1 = await addTask(w1.id, null, "T1");
    const w2 = await createWorkflow("Two", 5);
    const t2 = await addTask(w2.id, null, "T2");
    await startWorkflow(w1.id, t1.id);
    await startWorkflow(w2.id, t2.id);
    expect(activeIds(await wf(w1.id))).toEqual([]);
    expect(findTaskNode((await wf(w1.id)).rootNodes, t1.id)!.savePoints).toHaveLength(1);
    expect((await getMeta()).activeWorkflowId).toBe(w2.id);
  });

  it("stopWorkflow saves and clears the active pointers", async () => {
    const w = await createWorkflow("Stop", 5);
    const t = await addTask(w.id, null, "T");
    await startWorkflow(w.id, t.id);
    await stopWorkflow({ trigger: "stop", nextStep: "pick up the migration" });
    const meta = await getMeta();
    expect(meta.activeWorkflowId).toBeNull();
    expect(findTaskNode((await wf(w.id)).rootNodes, t.id)!.savePoints[0]!.nextStep).toBe("pick up the migration");
  });

  it("recordSavePoint keeps only the newest 10", async () => {
    const w = await createWorkflow("Saves", 5);
    const t = await addTask(w.id, null, "T");
    for (let i = 0; i < 12; i++) await recordSavePoint(w.id, t.id, { trigger: "manual", nextStep: `s${i}` });
    const sps = findTaskNode((await wf(w.id)).rootNodes, t.id)!.savePoints;
    expect(sps).toHaveLength(10);
    expect(sps[0]!.nextStep).toBe("s11");
  });

  it("completing a parent with open children needs cascade", async () => {
    const w = await createWorkflow("Done", 5);
    const p = await addTask(w.id, null, "Parent");
    const c = await addTask(w.id, p.id, "Child", { allocatedTimeMs: 60_000 });
    await expect(completeTask(w.id, p.id)).rejects.toMatchObject({ code: "open-children" });
    await completeTask(w.id, p.id, { cascade: true });
    const after = await wf(w.id);
    expect(findTaskNode(after.rootNodes, c.id)!.status).toBe("DONE");
    expect(alarms.clear).toHaveBeenCalledWith(`orion-task:${c.id}`);
  });

  it("completing returns the next pending task and a ready parent", async () => {
    const w = await createWorkflow("Next", 5);
    const p = await addTask(w.id, null, "P");
    const c1 = await addTask(w.id, p.id, "C1");
    const other = await addTask(w.id, null, "Other");
    await startWorkflow(w.id, c1.id);
    const r = await completeTask(w.id, c1.id);
    expect(r).toEqual({ nextTaskId: other.id, parentReadyId: p.id });
    expect((await getMeta()).currentActiveNodeId).toBeNull();
  });

  it("delete + restore round-trips position and never restores ACTIVE", async () => {
    const w = await createWorkflow("Undo", 5);
    const a = await addTask(w.id, null, "A");
    const b = await addTask(w.id, a.id, "B");
    await addTask(w.id, a.id, "C");
    await startWorkflow(w.id, b.id);
    const removed = await deleteTask(w.id, b.id);
    expect((await getMeta()).currentActiveNodeId).toBeNull();
    await restoreTask(w.id, removed);
    const after = await wf(w.id);
    expect(ids(after.rootNodes)).toEqual([a.id, b.id, expect.any(String)]);
    expect(findTaskNode(after.rootNodes, b.id)!.status).toBe("PENDING");
  });

  it("addOutline inserts a pasted tree atomically and respects limits", async () => {
    const w = await createWorkflow("Outline", 5);
    const p = await addTask(w.id, null, "P");
    const ids2 = await addOutline(w.id, p.id, parseOutline("a\n  b\nc"));
    const after = await wf(w.id);
    expect(ids2).toHaveLength(2);
    expect(findTaskNode(after.rootNodes, ids2[0]!)!.subTasks[0]!.title).toBe("b");
    const tooDeep = parseOutline(Array.from({ length: 8 }, (_, i) => `${"  ".repeat(i)}x${i}`).join("\n"));
    await expect(addOutline(w.id, p.id, tooDeep)).rejects.toMatchObject({ code: "max-depth" });
  });

  it("indent returns false when impossible", async () => {
    const w = await createWorkflow("Indent", 5);
    const a = await addTask(w.id, null, "A");
    expect(await indentTask(w.id, a.id)).toBe(false);
  });

  it("notes: decisions keep their kind and only safe source URLs", async () => {
    const w = await createWorkflow("Notes", 5);
    const t = await addTask(w.id, null, "T");
    await addNote(w.id, t.id, "Use backoff", "decision", "https://claude.ai/chat/1");
    await addNote(w.id, t.id, "!npm test", "note", "javascript:alert(1)");
    const notes = findTaskNode((await wf(w.id)).rootNodes, t.id)!.microNotes;
    expect(notes[0]).toMatchObject({ kind: "decision", sourceUrl: "https://claude.ai/chat/1" });
    expect(notes[1]).toMatchObject({ kind: "note", sourceUrl: null, isActionableCommand: true });
  });

  it("deleting a note can be undone in place, once", async () => {
    const w = await createWorkflow("Undo notes", 5);
    const t = await addTask(w.id, null, "T");
    await addNote(w.id, t.id, "first");
    const mid = await addNote(w.id, t.id, "second", "decision");
    await addNote(w.id, t.id, "third");
    const removed = await deleteNote(w.id, t.id, mid.id);
    expect(removed).toMatchObject({ index: 1, note: { id: mid.id, kind: "decision" } });
    expect(await deleteNote(w.id, t.id, mid.id)).toBeNull();
    await restoreNote(w.id, removed!);
    await restoreNote(w.id, removed!); // a double click on Undo doesn't duplicate
    const notes = findTaskNode((await wf(w.id)).rootNodes, t.id)!.microNotes;
    expect(notes.map((n) => n.content)).toEqual(["first", "second", "third"]);
  });

  it("dismissing an inbox item can be undone in place, once", async () => {
    const w = await createWorkflow("Undo inbox", 5);
    await addInboxItem(w.id, "a");
    const b = await addInboxItem(w.id, "b");
    await addInboxItem(w.id, "c");
    const removed = await dismissInboxItem(w.id, b.id);
    expect(removed?.index).toBe(1);
    expect(await dismissInboxItem(w.id, b.id)).toBeNull();
    await restoreInboxItem(w.id, removed!);
    await restoreInboxItem(w.id, removed!);
    expect((await wf(w.id)).inbox.map((i) => i.text)).toEqual(["c", "b", "a"]);
  });

  it("inbox promote creates a subtask and removes the item", async () => {
    const w = await createWorkflow("Inbox", 5);
    const p = await addTask(w.id, null, "P");
    const item = await addInboxItem(w.id, "check rate limits", p.id, "https://docs.example.com");
    const node = await promoteInboxItem(w.id, item.id, p.id);
    const after = await wf(w.id);
    expect(after.inbox).toEqual([]);
    expect(findTaskNode(after.rootNodes, node.id)).toMatchObject({ title: "check rate limits", parentId: p.id });
  });

  it("backup round-trips and importBackup rejects invalid files atomically", async () => {
    const w = await createWorkflow("Backup", 5);
    const t = await addTask(w.id, null, "T");
    await startWorkflow(w.id, t.id);
    const json = await exportBackup();
    const before = (await listWorkflows()).length;

    await expect(importBackup("{nope")).rejects.toMatchObject({ code: "invalid-backup" });
    await expect(importBackup(JSON.stringify({ app: "Other", workflows: [] }))).rejects.toMatchObject({ code: "invalid-backup" });
    const bad = JSON.stringify({ app: "OrionHUD", workflows: [{ id: "new-1", name: "ok", globalGracePeriodMins: 5 }, { id: "x" }] });
    await expect(importBackup(bad)).rejects.toMatchObject({ code: "invalid-backup" });
    expect(await getWorkflow("new-1")).toBeUndefined();
    expect((await listWorkflows()).length).toBe(before);

    const r = await importBackup(json);
    expect(r.imported).toBe(before);
    expect(findTaskNode((await wf(w.id)).rootNodes, t.id)!.status).toBe("PENDING");
  });

  it("importBackup rejects files over 5 MB", async () => {
    await expect(importBackup("x".repeat(5 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "invalid-backup" });
  });
});

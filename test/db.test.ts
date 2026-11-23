import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitWorkflow,
  getMeta,
  getWorkflow,
  listWorkflows,
  mutateMeta,
  mutateWorkflow,
  putWorkflows,
} from "../src/shared/db";
import type { IWorkflowState } from "../src/shared/types";
import { makeTask, makeWorkflow } from "./fixtures";

function addNoteTo(state: IWorkflowState, content: string): IWorkflowState {
  const task = state.rootNodes[0];
  if (!task) throw new Error("expected root task");
  return {
    ...state,
    rootNodes: [
      {
        ...task,
        microNotes: [
          ...task.microNotes,
          { id: content, content, timestamp: 1, isActionableCommand: false, kind: "note", sourceUrl: null },
        ],
      },
      ...state.rootNodes.slice(1),
    ],
  };
}

const notes = async () =>
  ((await getWorkflow("wf-1"))?.rootNodes[0]?.microNotes ?? []).map((n) => n.content).sort();

describe("workflow storage", () => {
  beforeEach(async () => {
    await commitWorkflow(makeWorkflow([makeTask("task-1", [], { status: "ACTIVE" })]));
  });

  it("persists and retrieves a workflow", async () => {
    expect((await getWorkflow("wf-1"))?.name).toBe("Test workflow");
  });

  it("does not lose updates when two notes are added concurrently", async () => {
    await Promise.all([
      mutateWorkflow("wf-1", (s) => addNoteTo(s, "note-a")),
      mutateWorkflow("wf-1", (s) => addNoteTo(s, "note-b")),
    ]);
    expect(await notes()).toEqual(["note-a", "note-b"]);
  });

  it("concurrent mutate across connections keeps both writes", async () => {
    // A second, independent copy of db.ts = a second IndexedDB connection,
    // exactly like the side panel vs the service worker.
    vi.resetModules();
    const other = await import("../src/shared/db");
    await Promise.all([
      mutateWorkflow("wf-1", (s) => addNoteTo(s, "panel")),
      other.mutateWorkflow("wf-1", (s) => addNoteTo(s, "worker")),
      mutateWorkflow("wf-1", (s) => addNoteTo(s, "panel-2")),
      other.mutateWorkflow("wf-1", (s) => addNoteTo(s, "worker-2")),
    ]);
    expect(await notes()).toEqual(["panel", "panel-2", "worker", "worker-2"]);
    other.__resetConnectionForTests();
  });

  it("control: a naive get-then-put loses one of two concurrent writes", async () => {
    const raw = async (content: string) => {
      const state = await getWorkflow("wf-1");
      await new Promise((r) => setTimeout(r, 5));
      await commitWorkflow(addNoteTo(state!, content));
    };
    await Promise.all([raw("note-a"), raw("note-b")]);
    expect((await notes()).length).toBeLessThan(2);
  });

  it("a throwing mutator leaves stored data untouched", async () => {
    await expect(
      mutateWorkflow("wf-1", () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect((await getWorkflow("wf-1"))?.rootNodes).toHaveLength(1);
  });

  it("mutating a missing workflow rejects", async () => {
    await expect(mutateWorkflow("nope", (s) => s)).rejects.toThrow("not found");
  });

  it("normalizes on read, so old records load", async () => {
    await putWorkflows([{ id: "old", name: "Old", globalGracePeriodMins: 5, rootNodes: [] } as unknown as IWorkflowState]);
    const old = await getWorkflow("old");
    expect(old?.inbox).toEqual([]);
    expect((await listWorkflows()).map((w) => w.id)).toContain("old");
  });
});

describe("meta storage", () => {
  it("mutateMeta is atomic for concurrent field updates", async () => {
    await Promise.all([
      mutateMeta((m) => ({ ...m, activeWorkflowId: "wf-1" })),
      mutateMeta((m) => ({ ...m, lastResumeShownAt: 123 })),
    ]);
    const meta = await getMeta();
    expect(meta.activeWorkflowId).toBe("wf-1");
    expect(meta.lastResumeShownAt).toBe(123);
  });
});

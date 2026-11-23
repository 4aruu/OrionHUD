import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { commitWorkflow, getWorkflow, mutateWorkflow } from "../src/shared/db";
import type { IWorkflowState } from "../src/shared/types";

function baseWorkflow(): IWorkflowState {
  return {
    id: "wf-1",
    name: "Test workflow",
    globalGracePeriodMins: 5,
    blacklistedDomains: [],
    rootNodes: [
      {
        id: "task-1",
        parentId: null,
        title: "Root task",
        status: "ACTIVE",
        allocatedTimeMs: null,
        timeRemainingMs: null,
        startedAt: Date.now(),
        completedAt: null,
        targetUrl: null,
        microNotes: [],
        subTasks: [],
      },
    ],
  };
}

describe("workflow storage", () => {
  beforeEach(async () => {
    await commitWorkflow(baseWorkflow());
  });

  it("persists and retrieves a workflow", async () => {
    const wf = await getWorkflow("wf-1");
    expect(wf?.name).toBe("Test workflow");
  });

  it("does not lose updates when two notes are added concurrently", async () => {
    const addNote = (content: string) =>
      mutateWorkflow("wf-1", (state) => {
        const task = state.rootNodes[0];
        if (!task) throw new Error("expected root task");
        return {
          ...state,
          rootNodes: [
            {
              ...task,
              microNotes: [
                ...task.microNotes,
                {
                  id: content,
                  content,
                  timestamp: Date.now(),
                  isActionableCommand: false,
                },
              ],
            },
            ...state.rootNodes.slice(1),
          ],
        };
      });

    // Fired without awaiting each other. Without the per-key lock in
    // db.ts, this is the classic lost-update race: both calls read the
    // same "0 notes" snapshot, both compute "1 note", and whichever
    // put() lands second wins, silently dropping the other note.
    await Promise.all([addNote("note-a"), addNote("note-b")]);

    const wf = await getWorkflow("wf-1");
    const notes = (wf?.rootNodes[0]?.microNotes ?? [])
      .map((n) => n.content)
      .sort();
    expect(notes).toEqual(["note-a", "note-b"]);
  });

  it("control: reproduces the lost update WITHOUT the lock", async () => {
    // Same scenario, but bypassing mutateWorkflow's lock to do a raw
    // get-then-put, to prove the race is real and not a strawman.
    const rawAddNote = async (content: string) => {
      const state = await getWorkflow("wf-1");
      if (!state) throw new Error("missing workflow");
      const task = state.rootNodes[0];
      if (!task) throw new Error("expected root task");
      // Simulate real-world interleaving: another async task (e.g. an
      // IndexedDB round trip) gets a chance to run between the read and
      // the write.
      await new Promise((r) => setTimeout(r, 5));
      const next: IWorkflowState = {
        ...state,
        rootNodes: [
          {
            ...task,
            microNotes: [
              ...task.microNotes,
              {
                id: content,
                content,
                timestamp: Date.now(),
                isActionableCommand: false,
              },
            ],
          },
          ...state.rootNodes.slice(1),
        ],
      };
      await commitWorkflow(next);
    };

    await Promise.all([rawAddNote("note-a"), rawAddNote("note-b")]);

    const wf = await getWorkflow("wf-1");
    const notes = wf?.rootNodes[0]?.microNotes.map((n) => n.content) ?? [];
    // This is the bug: exactly one note survives, not two. Asserting
    // notes.length === 1 here would make the "control" test look green
    // for the wrong reason, so instead assert it's LESS than the
    // correct count to show the data loss without hardcoding which
    // specific note won the race (that part is nondeterministic).
    expect(notes.length).toBeLessThan(2);
  });
});

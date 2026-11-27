import { describe, expect, it } from "vitest";
import { computeWelcome, type WelcomeFacts } from "../src/welcome/steps";
import type { IAppMeta, ISavePoint } from "../src/shared/types";
import { makeTask, makeWorkflow } from "./fixtures";

const noMeta: IAppMeta = {
  activeWorkflowId: null,
  currentActiveNodeId: null,
  lastActiveTimestamp: 0,
  blacklistedSince: null,
  lastResumeShownAt: null,
};

const sp = (createdAt: number): ISavePoint => ({
  id: `sp-${createdAt}`,
  createdAt,
  trigger: "manual",
  nextStep: null,
  tabs: [],
  tabsSource: "none",
});

function facts(over: Partial<WelcomeFacts> = {}): WelcomeFacts {
  return { workflows: [], meta: noMeta, tabsGranted: false, tabsAnswered: false, openedAt: 1000, pinned: false, ...over };
}

const activeFacts = (over: Partial<WelcomeFacts> = {}, taskOver = {}): WelcomeFacts => {
  const wf = makeWorkflow([makeTask("t1", [], { status: "ACTIVE", ...taskOver })]);
  return facts({ workflows: [wf], meta: { ...noMeta, activeWorkflowId: wf.id, currentActiveNodeId: "t1" }, ...over });
};

describe("computeWelcome", () => {
  it("fresh install: create mode, task current, rest todo", () => {
    const s = computeWelcome(facts());
    expect(s.taskMode).toBe("create");
    expect(s.steps).toEqual({ task: "current", tabs: "todo", save: "todo", pin: "todo" });
    expect(s.active).toBeNull();
    expect(s.recent).toEqual([]);
  });

  it("save step waits for an active task", () => {
    const s = computeWelcome(facts({ tabsAnswered: true }));
    expect(s.steps.save).toBe("todo");
    expect(s.steps.tabs).toBe("done");
  });

  it("reopened with an active task: step 1 done, no create", () => {
    const s = computeWelcome(activeFacts());
    expect(s.taskMode).toBe("done");
    expect(s.steps.task).toBe("done");
    expect(s.active?.task.id).toBe("t1");
    expect(s.steps.tabs).toBe("current");
  });

  it("pick mode lists recent tasks", () => {
    const a = makeWorkflow(
      [
        makeTask("a1", [], { savePoints: [sp(10)] }),
        makeTask("a2", [], { savePoints: [sp(50)] }),
        makeTask("a3", [], { status: "DONE", savePoints: [sp(999)] }),
        makeTask("a4", [makeTask("a4c", [], { savePoints: [sp(40)] })], { savePoints: [sp(5)] }),
      ],
      { id: "wf-a", name: "A" }
    );
    const b = makeWorkflow(
      [makeTask("b1", [], { savePoints: [sp(30)] }), makeTask("b2", [], { startedAt: 20 }), makeTask("b3", [], { savePoints: [sp(1)] })],
      { id: "wf-b", name: "B" }
    );
    const s = computeWelcome(facts({ workflows: [a, b] }));
    expect(s.taskMode).toBe("pick");
    expect(s.recent).toHaveLength(5);
    expect(s.recent.map((r) => r.taskId)).toEqual(["a2", "a4c", "b1", "a1", "a4"]);
    expect(s.recent[0]).toEqual({ workflowId: "wf-a", taskId: "a2", title: "a2", workflowName: "A" });
    expect(s.recent.some((r) => r.taskId === "a3")).toBe(false);
  });

  it("tasks without save points fall back to startedAt, newest first", () => {
    const wf = makeWorkflow([makeTask("old", [], { startedAt: 5 }), makeTask("new", [], { startedAt: 9 }), makeTask("none")]);
    expect(computeWelcome(facts({ workflows: [wf] })).recent.map((r) => r.taskId)).toEqual(["new", "old", "none"]);
  });

  it("recent includes SNOOZED tasks and milestones", () => {
    const wf = makeWorkflow(
      [makeTask("snz", [], { status: "SNOOZED", savePoints: [sp(2)] }), makeTask("ms", [], { isMilestone: true, savePoints: [sp(1)] })],
      { id: "wf-x", name: "X" }
    );
    const s = computeWelcome(facts({ workflows: [wf] }));
    expect(s.taskMode).toBe("pick");
    expect(s.recent.map((r) => r.taskId)).toEqual(["snz", "ms"]);
  });

  it("a stale active pointer falls back to pick", () => {
    const wf = makeWorkflow([makeTask("t1")]);
    const s = computeWelcome(facts({ workflows: [wf], meta: { ...noMeta, activeWorkflowId: "deleted-wf", currentActiveNodeId: "t1" } }));
    expect(s.active).toBeNull();
    expect(s.taskMode).toBe("pick");
    expect(s.steps.task).toBe("current");
    const noTask = computeWelcome(
      facts({ workflows: [wf], meta: { ...noMeta, activeWorkflowId: wf.id, currentActiveNodeId: "deleted-task" } })
    );
    expect(noTask.active).toBeNull();
    expect(noTask.taskMode).toBe("pick");
  });

  it("a stale active pointer with no tasks falls back to create", () => {
    const s = computeWelcome(facts({ meta: { ...noMeta, activeWorkflowId: "deleted-wf", currentActiveNodeId: "t1" } }));
    expect(s.active).toBeNull();
    expect(s.taskMode).toBe("create");
  });

  it("only completed tasks means create mode", () => {
    const wf = makeWorkflow([makeTask("d", [], { status: "DONE" })]);
    expect(computeWelcome(facts({ workflows: [wf] })).taskMode).toBe("create");
  });

  it("tabs done when granted or answered", () => {
    expect(computeWelcome(facts({ tabsGranted: true })).steps.tabs).toBe("done");
    expect(computeWelcome(facts({ tabsAnswered: true })).steps.tabs).toBe("done");
    expect(computeWelcome(facts()).steps.tabs).not.toBe("done");
  });

  it("save done only for a save point after openedAt", () => {
    const old = computeWelcome(activeFacts({ openedAt: 1000 }, { savePoints: [sp(999)] }));
    expect(old.steps.save).not.toBe("done");
    expect(old.savedSinceOpen).toBe(false);
    const fresh = computeWelcome(activeFacts({ openedAt: 1000 }, { savePoints: [sp(1000)] }));
    expect(fresh.steps.save).toBe("done");
    expect(fresh.savedSinceOpen).toBe(true);
  });

  it("pin: true done, false todo, null todo (never blocks)", () => {
    expect(computeWelcome(facts({ pinned: true })).steps.pin).toBe("done");
    expect(computeWelcome(facts({ pinned: false })).steps.pin).not.toBe("done");
    expect(computeWelcome(facts({ pinned: null })).steps.pin).not.toBe("done");
    const all = computeWelcome(activeFacts({ tabsGranted: true, pinned: null }, { savePoints: [sp(2000)] }));
    expect(all.steps).toEqual({ task: "done", tabs: "done", save: "done", pin: "current" });
  });
});

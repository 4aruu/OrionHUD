import { describe, expect, it } from "vitest";
import { normalizeMeta, normalizeWorkflow } from "../src/shared/normalize";
import { countNodes, depthOf } from "../src/shared/taskTree";

// Exactly what v0.1 wrote to IndexedDB: no inbox/createdAt, nodes without
// isMilestone/collapsed/savePoints, notes without kind/sourceUrl.
const v01Workflow = {
  id: "wf-old",
  name: "Old workflow",
  category: "software",
  globalGracePeriodMins: 5,
  blacklistedDomains: ["reddit.com"],
  rootNodes: [
    {
      id: "t1",
      parentId: null,
      title: "Root",
      status: "ACTIVE",
      allocatedTimeMs: 60000,
      timeRemainingMs: 60000,
      startedAt: 100,
      completedAt: null,
      targetUrl: null,
      microNotes: [{ id: "n1", content: "hello", timestamp: 5, isActionableCommand: false }],
      subTasks: [
        {
          id: "t2", parentId: "t1", title: "Child", status: "PENDING", allocatedTimeMs: null,
          timeRemainingMs: null, startedAt: null, completedAt: null, targetUrl: null, microNotes: [], subTasks: [],
        },
      ],
    },
  ],
};

describe("normalizeWorkflow", () => {
  it("normalizes v0.1 workflow with defaults for new fields", () => {
    const wf = normalizeWorkflow(v01Workflow)!;
    expect(wf.inbox).toEqual([]);
    expect(wf.createdAt).toBe(0);
    const root = wf.rootNodes[0]!;
    expect(root).toMatchObject({ isMilestone: false, collapsed: false, savePoints: [], status: "ACTIVE" });
    expect(root.microNotes[0]).toMatchObject({ kind: "note", sourceUrl: null, content: "hello" });
    expect(root.subTasks[0]!.parentId).toBe("t1");
  });

  it("rejects records missing required fields", () => {
    expect(normalizeWorkflow(null)).toBeNull();
    expect(normalizeWorkflow({ id: "x", name: "" , globalGracePeriodMins: 1 })).toBeNull();
    expect(normalizeWorkflow({ id: "x", name: "n" })).toBeNull();
  });

  it("drops malformed nodes, duplicate ids, and fixes parentIds", () => {
    const wf = normalizeWorkflow({
      id: "w", name: "n", globalGracePeriodMins: 5,
      rootNodes: [
        { id: "a", title: "A", parentId: "bogus", subTasks: "not-an-array" },
        { title: "no id" },
        { id: "a", title: "duplicate" },
        "garbage",
        { id: "b", title: "B", status: "WEIRD", subTasks: [{ id: "c", title: "C", parentId: "zzz" }] },
      ],
    })!;
    expect(wf.rootNodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(wf.rootNodes[0]!.parentId).toBeNull();
    expect(wf.rootNodes[0]!.subTasks).toEqual([]);
    expect(wf.rootNodes[1]!.status).toBe("PENDING");
    expect(wf.rootNodes[1]!.subTasks[0]!.parentId).toBe("b");
  });

  it("truncates trees deeper than 8 levels", () => {
    let node: Record<string, unknown> = { id: "d20", title: "leaf" };
    for (let i = 19; i >= 1; i--) node = { id: `d${i}`, title: `n${i}`, subTasks: [node] };
    const wf = normalizeWorkflow({ id: "w", name: "n", globalGracePeriodMins: 5, rootNodes: [node] })!;
    expect(countNodes(wf.rootNodes)).toBe(8);
    expect(depthOf(wf.rootNodes, "d8")).toBe(8);
  });

  it("caps total nodes at 500", () => {
    const rootNodes = Array.from({ length: 700 }, (_, i) => ({ id: `n${i}`, title: "t" }));
    const wf = normalizeWorkflow({ id: "w", name: "n", globalGracePeriodMins: 5, rootNodes })!;
    expect(countNodes(wf.rootNodes)).toBe(500);
  });

  it("strips unsafe URLs from save points, notes, and inbox items", () => {
    const wf = normalizeWorkflow({
      id: "w", name: "n", globalGracePeriodMins: 5,
      inbox: [{ id: "i", text: "idea", sourceUrl: "javascript:alert(1)" }],
      rootNodes: [{
        id: "a", title: "A",
        microNotes: [{ id: "n", content: "d", kind: "decision", sourceUrl: "data:text/html,x" }],
        savePoints: [{
          id: "s", createdAt: 1, trigger: "idle", nextStep: "go",
          tabs: [{ url: "javascript:alert(1)", title: "x" }, { url: "https://claude.ai/chat/1", title: "c", kind: "page" }],
          tabsSource: "window",
        }],
      }],
    })!;
    const a = wf.rootNodes[0]!;
    expect(wf.inbox[0]!.sourceUrl).toBeNull();
    expect(a.microNotes[0]).toMatchObject({ kind: "decision", sourceUrl: null });
    expect(a.savePoints[0]!.tabs).toEqual([
      { url: "https://claude.ai/chat/1", title: "c", kind: "ai-thread", vendor: "Claude" },
    ]);
  });
});

describe("normalizeMeta", () => {
  it("defaults everything for garbage input", () => {
    expect(normalizeMeta("nope", 42)).toEqual({
      activeWorkflowId: null,
      currentActiveNodeId: null,
      lastActiveTimestamp: 42,
      blacklistedSince: null,
      lastResumeShownAt: null,
    });
  });
});

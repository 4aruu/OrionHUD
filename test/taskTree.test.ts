import { describe, expect, it } from "vitest";
import {
  countNodes,
  depthOf,
  findPath,
  findTaskNode,
  flattenVisible,
  indentNode,
  insertNode,
  leafProgress,
  moveNode,
  nextPendingTask,
  outdentNode,
  removeNode,
  subtreeHeight,
  updateNode,
} from "../src/shared/taskTree";
import type { ITaskNode } from "../src/shared/types";
import { makeTask, shape } from "./fixtures";

function parentOf(nodes: ITaskNode[], id: string): string | null | undefined {
  return findTaskNode(nodes, id)?.parentId;
}

describe("findTaskNode", () => {
  it("finds a top-level node", () => {
    const tree = [makeTask("a"), makeTask("b")];
    expect(findTaskNode(tree, "b")?.id).toBe("b");
  });

  it("finds a deeply nested node", () => {
    const tree = [makeTask("a", [makeTask("b", [makeTask("c")])])];
    expect(findTaskNode(tree, "c")?.id).toBe("c");
  });

  it("returns undefined for a missing id", () => {
    expect(findTaskNode([makeTask("a")], "zzz")).toBeUndefined();
  });
});

describe("findPath / depthOf", () => {
  const tree = [makeTask("a", [makeTask("b", [makeTask("c")])]), makeTask("d")];

  it("returns root-to-node chain", () => {
    expect(findPath(tree, "c").map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("returns [] for a missing node", () => {
    expect(findPath(tree, "x")).toEqual([]);
  });

  it("depth is 1 for roots and 0 for missing", () => {
    expect(depthOf(tree, "d")).toBe(1);
    expect(depthOf(tree, "c")).toBe(3);
    expect(depthOf(tree, "x")).toBe(0);
  });

  it("subtreeHeight counts the node itself", () => {
    expect(subtreeHeight(tree[0]!)).toBe(3);
    expect(subtreeHeight(tree[1]!)).toBe(1);
  });
});

describe("insert / update / remove", () => {
  it("inserts at root end, under a parent, and at an index", () => {
    let t = [makeTask("a"), makeTask("b")];
    t = insertNode(t, null, makeTask("c"));
    t = insertNode(t, "a", makeTask("a1"));
    t = insertNode(t, null, makeTask("z"), 0);
    expect(shape(t)).toBe("z,a(a1),b,c");
    expect(parentOf(t, "a1")).toBe("a");
    expect(parentOf(t, "z")).toBeNull();
  });

  it("updateNode leaves other nodes untouched (same references)", () => {
    const t = [makeTask("a"), makeTask("b")];
    const next = updateNode(t, "b", (n) => ({ ...n, title: "B" }));
    expect(next[0]).toBe(t[0]);
    expect(findTaskNode(next, "b")?.title).toBe("B");
  });

  it("removeNode reports parent and index so it can be restored", () => {
    const t = [makeTask("a", [makeTask("x"), makeTask("y")])];
    const r = removeNode(t, "y");
    expect(r.removed?.id).toBe("y");
    expect(r.parentId).toBe("a");
    expect(r.index).toBe(1);
    expect(shape(r.nodes)).toBe("a(x)");
    const restored = insertNode(r.nodes, r.parentId, r.removed!, r.index);
    expect(shape(restored)).toBe("a(x,y)");
  });

  it("removeNode of a missing id is a no-op", () => {
    const t = [makeTask("a")];
    const r = removeNode(t, "nope");
    expect(r.removed).toBeNull();
    expect(r.nodes).toBe(t);
  });
});

describe("indent / outdent / move", () => {
  it("indent makes the node the last child of its previous sibling", () => {
    const t = [makeTask("a", [makeTask("a1")]), makeTask("b")];
    const next = indentNode(t, "b");
    expect(shape(next)).toBe("a(a1,b)");
    expect(parentOf(next, "b")).toBe("a");
  });

  it("indent of a first sibling is a no-op", () => {
    const t = [makeTask("a"), makeTask("b")];
    expect(indentNode(t, "a")).toBe(t);
  });

  it("indent is refused when it would exceed maxDepth", () => {
    // a > b > c, and sibling d (with child e) next to c at depth 3.
    const t = [makeTask("a", [makeTask("b", [makeTask("c"), makeTask("d", [makeTask("e")])])])];
    // Moving d under c: d at depth 4, e at depth 5. Allowed at maxDepth 5, refused at 4.
    expect(shape(indentNode(t, "d", 5))).toBe("a(b(c(d(e))))");
    expect(indentNode(t, "d", 4)).toBe(t);
  });

  it("outdent places the node right after its old parent", () => {
    const t = [makeTask("a", [makeTask("a1"), makeTask("a2")]), makeTask("b")];
    const next = outdentNode(t, "a1");
    expect(shape(next)).toBe("a(a2),a1,b");
    expect(parentOf(next, "a1")).toBeNull();
  });

  it("outdent of a root is a no-op", () => {
    const t = [makeTask("a")];
    expect(outdentNode(t, "a")).toBe(t);
  });

  it("nested outdent fixes parentId to the grandparent", () => {
    const t = [makeTask("a", [makeTask("b", [makeTask("c")])])];
    const next = outdentNode(t, "c");
    expect(shape(next)).toBe("a(b,c)");
    expect(parentOf(next, "c")).toBe("a");
  });

  it("moveNode swaps within siblings and clamps at the edges", () => {
    const t = [makeTask("a"), makeTask("b"), makeTask("c")];
    expect(shape(moveNode(t, "b", -1))).toBe("b,a,c");
    expect(shape(moveNode(t, "b", 1))).toBe("a,c,b");
    expect(moveNode(t, "a", -1)).toBe(t);
    expect(moveNode(t, "c", 1)).toBe(t);
  });
});

describe("progress and navigation", () => {
  it("leafProgress counts leaves only", () => {
    const t = [
      makeTask("a", [makeTask("a1", [], { status: "DONE" }), makeTask("a2")]),
      makeTask("b", [], { status: "DONE" }),
    ];
    expect(leafProgress(t)).toEqual({ done: 2, total: 3 });
    expect(leafProgress([])).toEqual({ done: 0, total: 0 });
  });

  it("a DONE parent counts all its leaves as done", () => {
    const t = [makeTask("a", [makeTask("a1"), makeTask("a2")], { status: "DONE" })];
    expect(leafProgress(t)).toEqual({ done: 2, total: 2 });
  });

  it("countNodes counts every node", () => {
    expect(countNodes([makeTask("a", [makeTask("b", [makeTask("c")])]), makeTask("d")])).toBe(4);
  });

  it("nextPendingTask returns the next pending leaf in document order, then wraps", () => {
    const t = [
      makeTask("a", [makeTask("a1", [], { status: "DONE" }), makeTask("a2")]),
      makeTask("b", [makeTask("b1")]),
      makeTask("c", [], { status: "DONE" }),
    ];
    expect(nextPendingTask(t, "a2")?.id).toBe("b1");
    expect(nextPendingTask(t, "b1")?.id).toBe("a2");
    expect(nextPendingTask(t, "a1")?.id).toBe("a2");
  });

  it("nextPendingTask returns null when nothing is pending", () => {
    const t = [makeTask("a", [], { status: "DONE" })];
    expect(nextPendingTask(t, "a")).toBeNull();
  });

  it("nextPendingTask skips leaves inside a DONE parent", () => {
    const t = [makeTask("a", [makeTask("a1")], { status: "DONE" }), makeTask("b")];
    expect(nextPendingTask(t, "x")?.id).toBe("b");
  });

  it("flattenVisible hides children of collapsed nodes", () => {
    const t = [
      makeTask("a", [makeTask("a1")], { collapsed: true }),
      makeTask("b", [makeTask("b1")]),
    ];
    expect(flattenVisible(t).map((r) => `${r.node.id}:${r.depth}`)).toEqual([
      "a:1",
      "b:1",
      "b1:2",
    ]);
  });
});

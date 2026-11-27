import { describe, expect, it } from "vitest";
import { elbowWidth, guideX, rowIndent, treeGuides, TREE_INDENT } from "../src/sidepanel/lib/treeGuides";

// Auth refactor              1
//   Token refresh            2
//     Design refresh lock    3
//     Write retry test       3
//       Mock 401 from /token 4
//       Assert single refresh 4
//   Logout everywhere        2
//     Revoke sessions        3
const PLAN = [1, 2, 3, 3, 4, 4, 2, 3];

describe("treeGuides", () => {
  const g = treeGuides(PLAN);

  it("draws a └ into every subtask and none into the top-level task", () => {
    expect(g.map((r) => r.elbow)).toEqual([false, true, true, true, true, true, true, true]);
  });

  it("starts a line under every parent whose children are showing", () => {
    expect(g.map((r) => r.stem)).toEqual([true, true, false, true, false, false, true, false]);
  });

  it("carries the parent's line on only while a later sibling is coming", () => {
    // Token refresh → Logout everywhere; Design lock → Write retry test; Mock 401 → Assert.
    expect(g.map((r) => r.more)).toEqual([false, true, true, false, true, false, false, false]);
  });

  it("keeps an ancestor's line running past nested rows until its next child", () => {
    // Auth refactor's line (depth 1) must pass the depth-3/4 rows under Token refresh to reach Logout everywhere.
    expect(g.map((r) => r.rails)).toEqual([[], [], [1], [1], [1], [1], [], []]);
  });

  it("stops ancestor lines once the last child is reached", () => {
    // Under Logout everywhere (the last depth-2 child) nothing continues to the left.
    expect(g[7]!.rails).toEqual([]);
  });

  it("follows the rows on screen: a collapsed parent has no stem", () => {
    const collapsed = treeGuides([1, 2, 2]);
    expect(collapsed.map((r) => r.stem)).toEqual([true, false, false]);
    expect(collapsed.map((r) => r.more)).toEqual([false, true, false]);
  });

  it("handles a lone task and an empty list", () => {
    expect(treeGuides([1])).toEqual([{ rails: [], elbow: false, more: false, stem: false }]);
    expect(treeGuides([])).toEqual([]);
  });

  it("keeps deep ancestors' lines independent of each other", () => {
    // 1, 2, 3, 4, 3, 2: at depth 4 both the depth-1 line (to the 2nd child) and the depth-2 line (to the 2nd grandchild) pass.
    expect(treeGuides([1, 2, 3, 4, 3, 2])[3]!.rails).toEqual([1, 2]);
  });
});

describe("tree geometry", () => {
  it("indents each level by the same step", () => {
    expect(rowIndent(2) - rowIndent(1)).toBe(TREE_INDENT);
    expect(rowIndent(1)).toBe(8);
  });

  it("puts a parent's line under its caret, and the elbow reaches the child's caret or checkbox", () => {
    expect(guideX(1)).toBe(rowIndent(1) + 8);
    expect(guideX(1) + elbowWidth(2, true)).toBe(rowIndent(2) + 3);
    expect(guideX(1) + elbowWidth(2, false)).toBe(rowIndent(2) + 20);
  });
});

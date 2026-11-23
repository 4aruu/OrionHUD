import { describe, expect, it } from "vitest";
import { findTaskNode } from "../src/shared/taskTree";
import type { ITaskNode } from "../src/shared/types";

function makeTask(id: string, subTasks: ITaskNode[] = []): ITaskNode {
  return {
    id,
    parentId: null,
    title: id,
    status: "PENDING",
    allocatedTimeMs: null,
    timeRemainingMs: null,
    startedAt: null,
    completedAt: null,
    targetUrl: null,
    microNotes: [],
    subTasks,
  };
}

describe("findTaskNode", () => {
  it("finds a top-level node", () => {
    const tree = [makeTask("a"), makeTask("b")];
    expect(findTaskNode(tree, "b")?.id).toBe("b");
  });

  it("finds a deeply nested node", () => {
    const tree = [makeTask("a", [makeTask("a1", [makeTask("a1a")])])];
    expect(findTaskNode(tree, "a1a")?.id).toBe("a1a");
  });

  it("returns undefined when the id doesn't exist", () => {
    const tree = [makeTask("a")];
    expect(findTaskNode(tree, "missing")).toBeUndefined();
  });
});

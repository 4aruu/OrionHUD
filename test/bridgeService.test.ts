import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeAlarmsMock } from "./chromeMock";
import { addOutline, createWorkflow, startWorkflow, stopWorkflow } from "../src/shared/workflowActions";
import { getMeta, getWorkflow } from "../src/shared/db";
import { findTaskNode, walk } from "../src/shared/taskTree";
import { buildBrief } from "../src/shared/brief";
import { parseOutline } from "../src/shared/outline";
import { handleBridgeRequest } from "../src/shared/bridgeService";
import { parseBridgeRequest, type BridgeRequest, type BridgeResponse } from "../src/shared/bridgeProtocol";
import type { ITaskNode, IWorkflowState } from "../src/shared/types";
import { classifyDisconnect } from "../src/background/bridge";

let nextId = 1;
function req(method: string, params: unknown = {}): BridgeRequest {
  const r = parseBridgeRequest({ v: 1, type: "request", id: nextId++, method, params });
  if (!r) throw new Error(`test built an invalid request: ${method}`);
  return r;
}

async function run(method: string, params: unknown = {}): Promise<{ res: BridgeResponse; changed: boolean }> {
  const { response, changed } = await handleBridgeRequest(req(method, params));
  return { res: response, changed };
}

function byTitle(nodes: ITaskNode[], title: string): ITaskNode {
  let hit: ITaskNode | null = null;
  walk(nodes, (n) => {
    if (!hit && n.title === title) hit = n;
  });
  if (!hit) throw new Error(`no task ${title}`);
  return hit;
}

async function load(id: string): Promise<IWorkflowState> {
  const wf = await getWorkflow(id);
  if (!wf) throw new Error("missing workflow");
  return wf;
}

describe("handleBridgeRequest", () => {
  let wf: IWorkflowState;

  beforeEach(async () => {
    installChromeAlarmsMock();
    await stopWorkflow();
    wf = await createWorkflow("Auth refactor", 5);
    await addOutline(
      wf.id,
      null,
      parseOutline(["- Token refresh", "  - Write retry test", "  - Handle 401", "    - Map error codes", "- Other branch", "  - Unrelated"].join("\n"))
    );
    wf = await load(wf.id);
    await startWorkflow(wf.id, byTitle(wf.rootNodes, "Token refresh").id);
  });

  it("answers no-active-task when nothing is active, without changing anything", async () => {
    await stopWorkflow();
    for (const m of ["get_current_task", "list_open_subtasks"]) {
      const { res, changed } = await run(m);
      expect(res).toMatchObject({ ok: false, code: "no-active-task" });
      expect(changed).toBe(false);
    }
  });

  it("get_current_task returns exactly the handoff brief", async () => {
    const { res } = await run("get_current_task");
    const fresh = await load(wf.id);
    expect(res).toMatchObject({ ok: true, text: buildBrief(fresh, byTitle(fresh.rootNodes, "Token refresh").id) });
  });

  it("list_open_subtasks shows nested open subtasks with ids, and only this task's", async () => {
    const { res } = await run("list_open_subtasks");
    if (!res.ok) throw new Error(res.message);
    const handle = byTitle(wf.rootNodes, "Handle 401");
    expect(res.text).toContain(`- [ ] Handle 401 · id: ${handle.id}`);
    expect(res.text).toContain(`  - [ ] Map error codes · id: ${byTitle(wf.rootNodes, "Map error codes").id}`);
    expect(res.text).not.toContain("Unrelated");
  });

  it("add_subtask adds under the current task or a descendant", async () => {
    const top = await run("add_subtask", { title: "Document the flow" });
    expect(top).toMatchObject({ res: { ok: true }, changed: true });
    const handle = byTitle(wf.rootNodes, "Handle 401");
    await run("add_subtask", { title: "Retry once", parent_id: handle.id });
    const fresh = await load(wf.id);
    const current = byTitle(fresh.rootNodes, "Token refresh");
    expect(current.subTasks.map((t) => t.title)).toContain("Document the flow");
    expect(byTitle(fresh.rootNodes, "Handle 401").subTasks.map((t) => t.title)).toContain("Retry once");
  });

  it("complete_task marks a leaf done and points at the next one", async () => {
    const leaf = byTitle(wf.rootNodes, "Write retry test");
    const { res, changed } = await run("complete_task", { task_id: leaf.id });
    expect(changed).toBe(true);
    if (!res.ok) throw new Error(res.message);
    expect(res.text).toContain("Completed “Write retry test”");
    expect(res.text).toContain("Next open subtask: “Map error codes”");
    expect(findTaskNode((await load(wf.id)).rootNodes, leaf.id)?.status).toBe("DONE");
    // Idempotent.
    expect(await run("complete_task", { task_id: leaf.id })).toMatchObject({ res: { ok: true }, changed: false });
  });

  it("complete_task refuses a task with open subtasks (no cascade over the bridge)", async () => {
    const handle = byTitle(wf.rootNodes, "Handle 401");
    expect(await run("complete_task", { task_id: handle.id })).toMatchObject({ res: { ok: false, code: "open-children" }, changed: false });
    expect(findTaskNode((await load(wf.id)).rootNodes, handle.id)?.status).toBe("PENDING");
  });

  it("rejects ids outside the current task's subtree: other branches, unknown ids", async () => {
    const other = byTitle(wf.rootNodes, "Unrelated");
    for (const [m, p] of [
      ["complete_task", { task_id: other.id }],
      ["add_subtask", { title: "x", parent_id: other.id }],
      ["log_decision", { text: "x", task_id: other.id }],
      ["complete_task", { task_id: "does-not-exist" }],
    ] as const) {
      expect(await run(m, p)).toMatchObject({ res: { ok: false, code: "out-of-scope" }, changed: false });
    }
    expect(findTaskNode((await load(wf.id)).rootNodes, other.id)?.status).toBe("PENDING");
  });

  it("log_decision appends a decision that shows up in the brief", async () => {
    expect(await run("log_decision", { text: "Retry at most 3 times" })).toMatchObject({ res: { ok: true }, changed: true });
    const { res } = await run("get_current_task");
    if (!res.ok) throw new Error(res.message);
    expect(res.text).toContain("## Decisions so far\n- Retry at most 3 times");
  });

  it("completing the current task itself leaves no task active", async () => {
    const current = byTitle(wf.rootNodes, "Token refresh");
    for (const t of ["Write retry test", "Map error codes", "Handle 401"]) {
      await run("complete_task", { task_id: byTitle(wf.rootNodes, t).id });
    }
    const { res } = await run("complete_task", { task_id: current.id });
    if (!res.ok) throw new Error(res.message);
    expect(res.text).toContain("no task is active now");
    expect((await getMeta()).currentActiveNodeId).toBeNull();
  });

  it("maps tree limits to a 'limit' error instead of leaking internals", async () => {
    let parent = byTitle(wf.rootNodes, "Map error codes"); // depth 3
    for (let depth = 4; depth <= 8; depth++) {
      const { res } = await run("add_subtask", { title: `d${depth}`, parent_id: parent.id });
      if (!res.ok) throw new Error(res.message);
      parent = byTitle((await load(wf.id)).rootNodes, `d${depth}`);
    }
    expect(await run("add_subtask", { title: "too deep", parent_id: parent.id })).toMatchObject({ res: { ok: false, code: "limit" } });
  });
});

describe("classifyDisconnect", () => {
  it("explains Chrome's disconnect reasons and only retries live connections", () => {
    expect(classifyDisconnect("Specified native messaging host not found.", false)).toEqual({ state: "not-installed", detail: null, retry: false });
    expect(classifyDisconnect("Access to the specified native messaging host is forbidden.", false)).toMatchObject({ state: "forbidden", retry: false });
    expect(classifyDisconnect("Native host has exited.", true)).toMatchObject({ state: "error", retry: true });
    expect(classifyDisconnect("Native host has exited.", false)).toMatchObject({ state: "error", retry: false });
  });
});

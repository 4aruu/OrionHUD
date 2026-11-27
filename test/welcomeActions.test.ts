import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeAlarmsMock } from "./chromeMock";
import { attachNextStep, pickUpTask, saveFromWelcome, startFromWelcome } from "../src/welcome/actions";
import { OrionError, addTask, createWorkflow, deleteWorkflowCascade } from "../src/shared/workflowActions";
import { getMeta, getWorkflow, listWorkflows, mutateMeta } from "../src/shared/db";
import { findTaskNode } from "../src/shared/taskTree";
import { latestNextStep } from "../src/shared/savePoints";

function installChrome() {
  const { create, clear } = installChromeAlarmsMock();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    alarms: { create, clear },
    permissions: { contains: vi.fn(() => Promise.resolve(false)) },
  };
}

async function taskOf(wfId: string, taskId: string) {
  const wf = await getWorkflow(wfId);
  const t = wf && findTaskNode(wf.rootNodes, taskId);
  if (!t) throw new Error("missing task");
  return t;
}

describe("welcome actions", () => {
  beforeEach(async () => {
    installChrome();
    for (const w of await listWorkflows()) await deleteWorkflowCascade(w.id);
    await mutateMeta((m) => ({ ...m, activeWorkflowId: null, currentActiveNodeId: null, lastResumeShownAt: null }));
  });

  it("startFromWelcome creates one active workflow and task", async () => {
    const { workflowId, taskId } = await startFromWelcome("Write the launch post");
    const all = await listWorkflows();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("Write the launch post");
    expect(all[0]?.rootNodes[0]?.title).toBe("Write the launch post");
    const meta = await getMeta();
    expect(meta.activeWorkflowId).toBe(workflowId);
    expect(meta.currentActiveNodeId).toBe(taskId);
  });

  it("startFromWelcome rejects a long title and writes nothing", async () => {
    await expect(startFromWelcome("x".repeat(121))).rejects.toBeInstanceOf(OrionError);
    expect(await listWorkflows()).toEqual([]);
  });

  it("pickUpTask makes it active", async () => {
    const wf = await createWorkflow("Old", 5);
    const t = await addTask(wf.id, null, "Old task");
    await pickUpTask(wf.id, t.id);
    const meta = await getMeta();
    expect(meta.activeWorkflowId).toBe(wf.id);
    expect(meta.currentActiveNodeId).toBe(t.id);
  });

  it("attachNextStep records only non-empty", async () => {
    const { workflowId, taskId } = await startFromWelcome("Task");
    const before = (await taskOf(workflowId, taskId)).savePoints.length;
    expect(await attachNextStep(workflowId, taskId, "  ")).toBe(false);
    expect((await taskOf(workflowId, taskId)).savePoints).toHaveLength(before);
    expect(await attachNextStep(workflowId, taskId, "Tighten the tagline")).toBe(true);
    const t = await taskOf(workflowId, taskId);
    expect(t.savePoints).toHaveLength(before + 1);
    expect(latestNextStep(t.savePoints)).toBe("Tighten the tagline");
  });

  it("saveFromWelcome records one save point with the next step", async () => {
    const { workflowId, taskId } = await startFromWelcome("Task");
    const before = (await taskOf(workflowId, taskId)).savePoints.length;
    await saveFromWelcome(workflowId, taskId, "Task", "Email the draft");
    const t = await taskOf(workflowId, taskId);
    expect(t.savePoints).toHaveLength(before + 1);
    expect(t.savePoints[0]?.trigger).toBe("manual");
    expect(t.savePoints[0]?.nextStep).toBe("Email the draft");
  });

  it("saveFromWelcome stores a null next step when empty", async () => {
    const { workflowId, taskId } = await startFromWelcome("Task");
    await saveFromWelcome(workflowId, taskId, "Task", "   ");
    expect((await taskOf(workflowId, taskId)).savePoints[0]?.nextStep).toBeNull();
  });
});

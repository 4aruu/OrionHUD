import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeAlarmsMock } from "./chromeMock";

const fail = vi.hoisted(() => ({ addTask: false, startWorkflow: false, cleanup: false }));
vi.mock("../src/shared/workflowActions", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/shared/workflowActions")>();
  return {
    ...real,
    addTask: (...a: Parameters<typeof real.addTask>) =>
      fail.addTask ? Promise.reject(new Error("idb addTask failed")) : real.addTask(...a),
    startWorkflow: (...a: Parameters<typeof real.startWorkflow>) =>
      fail.startWorkflow ? Promise.reject(new Error("idb startWorkflow failed")) : real.startWorkflow(...a),
    deleteWorkflowCascade: (...a: Parameters<typeof real.deleteWorkflowCascade>) =>
      fail.cleanup ? Promise.reject(new Error("idb cleanup failed")) : real.deleteWorkflowCascade(...a),
  };
});
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
    fail.addTask = false;
    fail.startWorkflow = false;
    fail.cleanup = false;
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

  it("startFromWelcome removes the new workflow when addTask fails", async () => {
    fail.addTask = true;
    await expect(startFromWelcome("Doomed")).rejects.toThrow("idb addTask failed");
    expect(await listWorkflows()).toEqual([]);
  });

  it("startFromWelcome removes the new workflow when startWorkflow fails", async () => {
    fail.startWorkflow = true;
    await expect(startFromWelcome("Doomed")).rejects.toThrow("idb startWorkflow failed");
    expect(await listWorkflows()).toEqual([]);
  });

  it("startFromWelcome rethrows the original error when the cleanup also fails, and warns about the cleanup", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fail.addTask = true;
      fail.cleanup = true;
      await expect(startFromWelcome("Doomed")).rejects.toThrow("idb addTask failed");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[Orion Waypoint]"), expect.objectContaining({ message: "idb cleanup failed" }));
    } finally {
      warn.mockRestore();
      fail.cleanup = false;
    }
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

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeAlarmsMock } from "./chromeMock";
import {
  addMicroNote,
  addTask,
  completeTask,
  createWorkflow,
  findTaskInWorkflow,
  getWorkflow,
  startWorkflow,
} from "../src/shared/workflowActions";
import { getMeta } from "../src/shared/db";

describe("workflow orchestration", () => {
  let alarmsMock: ReturnType<typeof installChromeAlarmsMock>;

  beforeEach(() => {
    alarmsMock = installChromeAlarmsMock();
  });

  it("creates a workflow with an empty task tree", async () => {
    const wf = await createWorkflow("Deploy", 5, ["slack.com"]);
    expect(wf.rootNodes).toEqual([]);
    expect(wf.blacklistedDomains).toEqual(["slack.com"]);
  });

  it("adds a task at the root and a nested subtask", async () => {
    const wf = await createWorkflow("Deploy", 5);
    const root = await addTask(wf.id, null, "Build image", {
      allocatedTimeMs: 8 * 60_000,
    });
    await addTask(wf.id, root.id, "Push to registry");

    const updated = await getWorkflow(wf.id);
    expect(updated?.rootNodes).toHaveLength(1);
    expect(updated?.rootNodes[0]?.subTasks).toHaveLength(1);
    expect(updated?.rootNodes[0]?.subTasks[0]?.title).toBe(
      "Push to registry"
    );
  });

  it("starting a workflow marks the task ACTIVE and schedules its alarm", async () => {
    const wf = await createWorkflow("Deploy", 5);
    const task = await addTask(wf.id, null, "Build image", {
      allocatedTimeMs: 8 * 60_000,
    });

    await startWorkflow(wf.id, task.id);

    const updated = await getWorkflow(wf.id);
    const found = findTaskInWorkflow(updated!, task.id);
    expect(found?.status).toBe("ACTIVE");
    expect(found?.startedAt).not.toBeNull();

    expect(alarmsMock.create).toHaveBeenCalledTimes(1);
    expect(alarmsMock.create).toHaveBeenCalledWith(
      `orion-task:${task.id}`,
      expect.objectContaining({ delayInMinutes: 8 })
    );

    const meta = await getMeta();
    expect(meta.activeWorkflowId).toBe(wf.id);
    expect(meta.currentActiveNodeId).toBe(task.id);
  });

  it("a manual-checkpoint task (no allocatedTimeMs) does not schedule an alarm", async () => {
    const wf = await createWorkflow("Deploy", 5);
    const task = await addTask(wf.id, null, "Manual review");

    await startWorkflow(wf.id, task.id);

    expect(alarmsMock.create).not.toHaveBeenCalled();
  });

  it("completing a task clears its alarm", async () => {
    const wf = await createWorkflow("Deploy", 5);
    const task = await addTask(wf.id, null, "Build image", {
      allocatedTimeMs: 8 * 60_000,
    });
    await startWorkflow(wf.id, task.id);

    await completeTask(wf.id, task.id);

    const updated = await getWorkflow(wf.id);
    expect(findTaskInWorkflow(updated!, task.id)?.status).toBe("DONE");
    expect(alarmsMock.clear).toHaveBeenCalledWith(`orion-task:${task.id}`);
  });

  it("adds a micro note to a nested task without disturbing siblings", async () => {
    const wf = await createWorkflow("Deploy", 5);
    const root = await addTask(wf.id, null, "Build image");
    const child = await addTask(wf.id, root.id, "Push to registry");

    await addMicroNote(wf.id, child.id, "Registry endpoint: x", false);

    const updated = await getWorkflow(wf.id);
    const found = findTaskInWorkflow(updated!, child.id);
    expect(found?.microNotes).toHaveLength(1);
    expect(found?.microNotes[0]?.content).toBe("Registry endpoint: x");
  });
});

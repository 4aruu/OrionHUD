import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeAlarmsMock } from "./chromeMock";
import { importBackupFile } from "../src/sidepanel/lib/backup";
import { OrionError, addTask, createWorkflow, deleteWorkflowCascade, exportBackup } from "../src/shared/workflowActions";
import { listWorkflows } from "../src/shared/db";

describe("importBackupFile", () => {
  beforeEach(async () => {
    const { create, clear } = installChromeAlarmsMock();
    (globalThis as unknown as { chrome: unknown }).chrome = { alarms: { create, clear } };
    for (const w of await listWorkflows()) await deleteWorkflowCascade(w.id);
  });

  it("importBackupFile rejects > 5 MB", async () => {
    const file = new File(["x".repeat(5 * 1024 * 1024 + 1)], "big.json");
    const result = importBackupFile(file);
    await expect(result).rejects.toBeInstanceOf(OrionError);
    await expect(result).rejects.toThrow("Backup file is larger than 5 MB.");
  });

  it("imports a valid export", async () => {
    const wf = await createWorkflow("Launch", 5);
    await addTask(wf.id, null, "Write the post");
    const json = await exportBackup();
    await deleteWorkflowCascade(wf.id);

    await expect(importBackupFile(new File([json], "b.json"))).resolves.toEqual({ imported: 1 });
    expect((await listWorkflows()).map((w) => w.name)).toEqual(["Launch"]);
  });
});

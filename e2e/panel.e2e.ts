// The side panel, end to end, in real Chromium with the built extension.
// Each test gets a fresh profile (empty IndexedDB).

import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { createWorkflow, expect, resumeCard, test } from "./fixtures";

const PLAN = ["Auth refactor", "  Token refresh", "    Write retry test", "  Logout everywhere", "Docs"].join("\n");
const toast = (page: Page) => page.locator(".toast");

/** Row actions only show on hover or focus, like for a real user. */
async function workOn(page: Page, title: string): Promise<void> {
  const row = page.getByRole("treeitem").filter({ hasText: title }).last();
  await row.hover();
  await row.getByRole("button", { name: `Work on ${title}` }).click();
}

test("first run: welcome screen, then a workflow built from a pasted outline", async ({ panel }) => {
  await expect(panel.getByRole("heading", { name: "Never lose your place again" })).toBeVisible();
  await createWorkflow(panel, "Payments API v2", PLAN);

  const tree = panel.getByRole("tree", { name: "Tasks in Payments API v2" });
  for (const title of ["Auth refactor", "Token refresh", "Write retry test", "Logout everywhere", "Docs"]) {
    await expect(tree.getByRole("treeitem").filter({ hasText: title }).first()).toBeVisible();
  }
  // Leaves: Write retry test, Logout everywhere, Docs.
  await expect(panel.getByLabel("0 of 3 tasks done")).toBeVisible();
});

test("complete and reopen a task updates progress", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  await panel.getByRole("button", { name: "Complete Write retry test" }).click();
  await expect(panel.getByLabel("1 of 3 tasks done")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Reopen Write retry test" })).toBeVisible();

  await panel.getByRole("button", { name: "Reopen Write retry test" }).click();
  await expect(panel.getByLabel("0 of 3 tasks done")).toBeVisible();
});

test("add a task inline from the outline", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  await panel.getByRole("button", { name: "+ Add task" }).click();
  await panel.getByLabel("New task title").fill("Release notes");
  await panel.getByLabel("New task title").press("Enter");
  await panel.getByLabel("New task title").press("Escape");
  await expect(panel.getByRole("treeitem").filter({ hasText: "Release notes" })).toBeVisible();
  await expect(panel.getByLabel("0 of 4 tasks done")).toBeVisible();
});

test("work on a task, set a next step, switch with a save point, pause", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);

  await workOn(panel, "Logout everywhere");
  const current = resumeCard(panel);
  await expect(current).toContainText("Logout everywhere");
  await expect(panel.getByRole("button", { name: "Pause" })).toBeVisible();

  await current.getByRole("button", { name: "Add the one thing to do next" }).click();
  await current.getByLabel("Next step").fill("Check the session revoke endpoint");
  await current.getByRole("button", { name: "Save" }).click();
  await expect(current.getByRole("button", { name: "Check the session revoke endpoint" })).toBeVisible();

  // Switching asks what to do next on the task being left, then saves it.
  await workOn(panel, "Docs");
  const leaving = panel.getByLabel("Next step for the task you're leaving");
  await leaving.fill("Wire up the logout button");
  await leaving.press("Enter");
  await expect(toast(panel)).toContainText("Saved where you were.");
  await expect(resumeCard(panel)).toContainText("Docs");
  await expect(panel.getByRole("treeitem").filter({ hasText: "Logout everywhere" }).getByLabel("Has a saved next step")).toBeVisible();

  await panel.getByRole("button", { name: "Pause" }).click();
  await panel.getByLabel("Next step for the task you're leaving").fill("Draft the README section");
  await panel.getByLabel("Next step for the task you're leaving").press("Enter");
  await expect(toast(panel)).toContainText("Paused.");
  await expect(panel.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Resume task" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Draft the README section" })).toBeVisible();
});

test("notes, decisions and the inbox", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);

  // The first root task is focused by default.
  const inspector = panel.getByRole("region", { name: "Details for Auth refactor" });
  await inspector.getByRole("textbox", { name: "Note" }).fill("npm run test:auth");
  await inspector.getByRole("textbox", { name: "Note" }).press("Enter");
  await expect(inspector).toContainText("npm run test:auth");

  await inspector.getByRole("checkbox", { name: "Decision" }).check();
  await inspector.getByRole("textbox", { name: "Note" }).fill("Rotate refresh tokens so a leaked one dies on next use");
  await inspector.getByRole("textbox", { name: "Note" }).press("Enter");
  await expect(inspector.getByRole("heading", { name: "Decisions" })).toBeVisible();
  await expect(inspector.locator(".log-decision")).toContainText("Rotate refresh tokens");

  await panel.getByRole("button", { name: /Inbox/ }).click();
  await panel.getByLabel("Inbox item").fill("Look into rate limits");
  await panel.getByLabel("Inbox item").press("Enter");
  await expect(panel.locator(".inbox-list")).toContainText("Look into rate limits");
  await panel.getByRole("button", { name: "→ Task" }).click();
  await expect(toast(panel)).toContainText("Added as a task.");
  await expect(panel.getByRole("treeitem").filter({ hasText: "Look into rate limits" })).toBeVisible();
});

test("data survives a reload and the active workflow reopens", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  await workOn(panel, "Token refresh");
  await expect(resumeCard(panel)).toContainText("Token refresh");

  await panel.reload();
  await expect(panel.getByRole("heading", { level: 2, name: "Payments API v2" })).toBeVisible();
  await expect(resumeCard(panel)).toContainText("Token refresh");

  await panel.getByRole("button", { name: "All workflows" }).click();
  await expect(panel.getByRole("heading", { name: "Workflows" })).toBeVisible();
  await expect(panel.locator(".wf-card")).toContainText("Payments API v2");
});

test("copy brief puts the handoff brief on the clipboard", async ({ panel }) => {
  // Extension pages can't be granted clipboard-read, so record what the real
  // writeText call receives (it still runs: the toast only shows if it resolved).
  await panel.evaluate(() => {
    const real = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text: string) => {
      (window as unknown as { __copied: string }).__copied = text;
      return real(text);
    };
  });
  await createWorkflow(panel, "Payments API v2", PLAN);
  await workOn(panel, "Token refresh");
  await resumeCard(panel).getByRole("button", { name: "Copy brief" }).click();
  await expect(toast(panel)).toContainText("Brief copied.");
  const brief = await panel.evaluate(() => (window as unknown as { __copied: string }).__copied);
  expect(brief).toContain("Token refresh");
  expect(brief).toContain("Write retry test");
});

test("backup: export, delete, import brings the workflow back", async ({ panel }, info) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  await panel.getByRole("button", { name: "All workflows" }).click();
  await panel.getByRole("button", { name: "Settings" }).click();
  await expect(panel.getByRole("heading", { name: "Settings" })).toBeVisible();

  const downloadP = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toMatch(/^orionhud-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = info.outputPath("backup.json");
  await download.saveAs(file);
  const json = await readFile(file, "utf8");
  expect(json).toContain("Payments API v2");
  expect(() => JSON.parse(json)).not.toThrow();

  await panel.getByRole("button", { name: "Delete…" }).click();
  await panel.getByRole("button", { name: "Delete forever" }).click();
  await expect(toast(panel)).toContainText("Deleted “Payments API v2”.");
  await expect(panel.getByRole("heading", { name: "Delete a workflow" })).toHaveCount(0);

  await panel.locator('input[type="file"]').setInputFiles(file);
  await expect(toast(panel)).toContainText("Imported 1 workflow.");
  await panel.getByRole("button", { name: "Back", exact: true }).click();
  await expect(panel.locator(".wf-card")).toContainText("Payments API v2");
});

test("import rejects a file that isn't a backup", async ({ panel }, info) => {
  await panel.getByRole("button", { name: "Import a backup" }).click();
  const bad = info.outputPath("bad.json");
  await (await import("node:fs/promises")).writeFile(bad, '{"hello":"world"}');
  await panel.locator('input[type="file"]').setInputFiles(bad);
  await expect(panel.locator(".toast-error")).toBeVisible();
  await panel.getByRole("button", { name: "Back", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Never lose your place again" })).toBeVisible();
});

test("settings shows the agent bridge off by default", async ({ panel }) => {
  await panel.getByRole("button", { name: "Import a backup" }).click(); // opens Settings
  const card = panel.locator("section.card").filter({ has: panel.getByRole("heading", { name: "Agent bridge" }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Turn on agent bridge" })).toBeEnabled();
  await expect(card.getByRole("status")).toHaveCount(0);
  await expect(card.locator(".bridge-cmd")).toHaveCount(0);
});

test("keyboard: ? opens the shortcut help, Escape closes it", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  await panel.locator("body").click({ position: { x: 5, y: 5 } });
  await panel.keyboard.press("?");
  await expect(panel.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(panel.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
});

test("the service worker starts clean", async ({ ext }) => {
  // Worker globals load and the extension's own storage is reachable.
  const ok = await ext.worker.evaluate(async () => {
    const s = await chrome.storage.session.get(null);
    return typeof s === "object" && chrome.runtime.getManifest().version;
  });
  expect(ok).toBe("0.3.0");
});

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
  await panel.getByRole("button", { name: "Add as task" }).click();
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

  // Destructive: a dialog that names the workflow, with Cancel focused.
  await panel.getByRole("button", { name: "Delete Payments API v2" }).click();
  const dialog = panel.getByRole("alertdialog", { name: "Delete workflow “Payments API v2”?" });
  await expect(dialog).toContainText("5 tasks");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await panel.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Delete Payments API v2" })).toBeFocused();
  await panel.getByRole("button", { name: "Delete Payments API v2" }).click();
  await dialog.getByRole("button", { name: "Delete workflow" }).click();
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

test("deleting a note, a decision or an inbox item can be undone", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  const inspector = panel.getByRole("region", { name: "Details for Auth refactor" });
  await expect(inspector.getByText("Add a note")).toBeVisible(); // a visible label, not just a placeholder
  await inspector.getByRole("textbox", { name: "Note" }).fill("npm run test:auth");
  await inspector.getByRole("textbox", { name: "Note" }).press("Enter");
  await inspector.getByRole("button", { name: "Delete note" }).click();
  await expect(inspector).not.toContainText("npm run test:auth");
  await panel.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(inspector).toContainText("npm run test:auth");

  await panel.getByRole("button", { name: /Inbox/ }).click();
  await expect(panel.getByText("Park a side quest")).toBeVisible();
  await panel.getByLabel("Inbox item").fill("Look into rate limits");
  await panel.getByLabel("Inbox item").press("Enter");
  await panel.getByRole("button", { name: "Dismiss inbox item" }).click();
  await expect(panel.locator(".inbox-list")).toHaveCount(0);
  await panel.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(panel.locator(".inbox-list")).toContainText("Look into rate limits");
});

test("create form: says what's missing instead of a dead button, and keeps a draft", async ({ panel }) => {
  await panel.getByRole("button", { name: "Create your first workflow" }).click();
  const create = panel.getByRole("button", { name: "Create workflow" });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(panel.getByRole("alert")).toHaveText("Name the workflow, like “Payments API v2”.");
  await expect(panel.getByLabel("Workflow name")).toBeFocused();
  await expect(panel.getByLabel("Workflow name")).toHaveAttribute("aria-invalid", "true");
  await panel.getByLabel("Workflow name").fill("Half-typed");
  await expect(panel.getByRole("alert")).toHaveCount(0); // clears on the first keystroke

  const plan = ["Step one", "  Step two"].join("\n");
  await panel.getByLabel("Plan: one task per line, indent for subtasks").fill(plan);
  await panel.reload(); // the panel closed by accident
  await panel.getByRole("button", { name: "Create your first workflow" }).click();
  await expect(panel.getByLabel("Workflow name")).toHaveValue("Half-typed");
  await expect(panel.getByLabel("Plan: one task per line, indent for subtasks")).toHaveValue(plan);
  await panel.getByRole("button", { name: "Create workflow" }).click();
  await expect(panel.getByRole("heading", { level: 2, name: "Half-typed" })).toBeVisible();

  await panel.getByRole("button", { name: "All workflows" }).click();
  await panel.getByRole("button", { name: "New workflow" }).click();
  await expect(panel.getByLabel("Workflow name")).toHaveValue(""); // draft cleared after creating
});

test("keyboard: the help dialog keeps focus inside and gives it back", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  const trigger = panel.getByRole("button", { name: "Keyboard shortcuts" });
  await trigger.focus();
  await panel.keyboard.press("Enter");
  const dialog = panel.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await panel.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused(); // nowhere else to go inside
  await panel.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("an empty next step explains itself instead of doing nothing", async ({ panel }) => {
  await createWorkflow(panel, "Payments API v2", PLAN);
  await workOn(panel, "Docs");
  const card = resumeCard(panel);
  await card.getByRole("button", { name: "Add the one thing to do next" }).click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("alert")).toContainText("Type the one thing you'll do next");
});

test("comfortable sizes: no text under 12px, tap targets of 24px or more, no sideways scroll", async ({ panel }) => {
  await panel.setViewportSize({ width: 360, height: 800 });
  await createWorkflow(panel, "Payments API v2", PLAN);
  await workOn(panel, "Token refresh");
  const report = await panel.evaluate(() => {
    const tiny: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (ownText && el.getBoundingClientRect().width && parseFloat(getComputedStyle(el).fontSize) < 12) tiny.push(el.textContent!.trim().slice(0, 30));
    }
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a, input, select"))) {
      // An input inside a <label> is clicked through the whole label.
      const r = (el.tagName === "INPUT" && el.closest("label") ? el.closest("label")! : el).getBoundingClientRect();
      if (!r.width) continue;
      // Checkboxes and chevrons draw small but click through a 24px ::after.
      const after = getComputedStyle(el, "::after");
      const grow = after.content !== "none" && after.position === "absolute" ? -2 * parseFloat(after.top || "0") : 0;
      if (r.width + grow < 24 || r.height + grow < 24) small.push(`${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { tiny, small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(report.tiny).toEqual([]);
  expect(report.small).toEqual([]);
  expect(report.overflow).toBe(0);
});

// Shared Playwright setup: load the built extension into a fresh Chromium
// profile, find its ID, and open the side panel page.

import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DIST = join(ROOT, "dist");
export const PANEL_PATH = "src/sidepanel/index.html";

export interface LaunchedExtension {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  close: () => Promise<void>;
}

export interface LaunchOptions {
  /** Extra environment for Chromium (and therefore for native hosts it starts). */
  env?: Record<string, string>;
}

export async function launchExtension(extDir: string, opts: LaunchOptions = {}): Promise<LaunchedExtension> {
  if (!existsSync(join(extDir, "manifest.json"))) throw new Error(`No built extension in ${extDir}. Run npm run build first.`);
  const profile = await mkdtemp(join(tmpdir(), "orion-e2e-profile-"));
  const context = await chromium.launchPersistentContext(profile, {
    // The "chromium" channel runs the new headless mode, which supports extensions.
    channel: "chromium",
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    ...(opts.env ? { env: { ...process.env, ...opts.env } as Record<string, string> } : {}),
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    worker,
    extensionId,
    close: async () => {
      await context.close();
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/** Errors a page reported: uncaught exceptions and console.error lines. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

export async function openPanel(ext: LaunchedExtension): Promise<{ page: Page; errors: string[] }> {
  const page = await ext.context.newPage();
  const errors = collectErrors(page);
  await page.goto(`chrome-extension://${ext.extensionId}/${PANEL_PATH}`);
  await expect(page.locator(".loading")).toHaveCount(0);
  return { page, errors };
}

/** Create a workflow from the panel's home screen with a pasted outline. */
export async function createWorkflow(page: Page, name: string, plan: string): Promise<void> {
  const first = page.getByRole("button", { name: "Create your first workflow" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "New workflow" }).click();
  await page.getByLabel("Workflow name").fill(name);
  await page.getByLabel("Plan: one task per line, indent for subtasks").fill(plan);
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

/**
 * The resume card. It's titled "Current task", or "Welcome back" right after
 * an idle save point: Chrome's idle detection follows the real OS, so an
 * unattended machine can flip it mid-test.
 */
export function resumeCard(page: Page) {
  return page.getByRole("region", { name: /^(Current task|Welcome back)$/ });
}

type Fixtures = { ext: LaunchedExtension; panel: Page };

/** `ext` = the extension in a fresh profile; `panel` = its side panel page, checked for errors after the test. */
export const test = base.extend<Fixtures>({
  ext: async ({}, use) => {
    const ext = await launchExtension(DIST);
    await use(ext);
    await ext.close();
  },
  panel: async ({ ext }, use) => {
    const { page, errors } = await openPanel(ext);
    await use(page);
    expect(errors, "the side panel logged errors").toEqual([]);
  },
});

export { expect };

// The agent bridge for real: built extension in Chromium, the real
// `orionhud-bridge install`, Chromium launching the native host, and an MCP
// client talking to `orionhud-bridge mcp` exactly as Claude Code would.
//
// Side effects: everything goes to a temporary folder, except the per-user
// registry value Chrome reads on Windows (HKCU\Software\Google\Chrome\
// NativeMessagingHosts\com.orionhud.bridge). Any value already there is
// saved first and put back afterwards.

import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { CDPSession, Page } from "@playwright/test";
import { DIST, ROOT, createWorkflow, expect, openNotes, resumeCard, launchExtension, openPanel, test, type LaunchedExtension } from "./fixtures";

const BUNDLE = join(ROOT, "bridge", "dist", "orion-bridge.mjs");
const HOST = "com.orionhud.bridge";
const REG_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST}`;const WRONG_ID = "abcdefghijklmnopabcdefghijklmnop";

// ---------- sandbox ----------

interface Sandbox {
  root: string;
  extDir: string;
  /** Environment that points every bridge path (and Chromium's native host) into the sandbox. */
  env: Record<string, string>;
  /** Where install copies the bundle: what an agent is told to run. */
  stableBundle: string;
}

async function makeSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "orion-e2e-bridge-"));
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  const env: Record<string, string> =
    process.platform === "win32"
      ? { LOCALAPPDATA: join(root, "localappdata") }
      : { HOME: home, XDG_DATA_HOME: join(home, ".local", "share"), XDG_CONFIG_HOME: join(home, ".config") };

  // A copy of the build where nativeMessaging is already granted: automation
  // can't click Chrome's permission prompt. Everything else is the real build.
  const extDir = join(root, "ext");
  await cp(DIST, extDir, { recursive: true });
  const manifestPath = join(extDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { permissions: string[]; optional_permissions: string[] };
  manifest.permissions.push("nativeMessaging");
  manifest.optional_permissions = manifest.optional_permissions.filter((p) => p !== "nativeMessaging");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const dataDir =
    process.platform === "win32"
      ? join(env.LOCALAPPDATA!, "OrionHUD", "bridge")
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support", "OrionHUD", "bridge")
        : join(env.XDG_DATA_HOME!, "orionhud", "bridge");
  return { root, extDir, env, stableBundle: join(dataDir, "orion-bridge.mjs") };
}

function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env: { ...process.env, ...env }, windowsHide: true }, (err, stdout, stderr) =>
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr })
    );
  });
}

/** Run the bridge CLI from the repo build, as the Settings card tells users to. */
function bridgeCli(sb: Sandbox, ...args: string[]) {
  return run(process.execPath, [BUNDLE, ...args], sb.env);
}

/**
 * On Windows, Chromium reads Chrome's registry key, so nothing to do (verified).
 * On macOS/Linux it scans its own folder; mirror the installed manifest there
 * (not yet run on those platforms).
 */
async function mirrorManifestForChromium(sb: Sandbox): Promise<void> {
  if (process.platform === "win32") return;
  const home = sb.env.HOME!;
  const chromeDir =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
      : join(sb.env.XDG_CONFIG_HOME!, "google-chrome", "NativeMessagingHosts");
  const chromiumDir =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support", "Chromium", "NativeMessagingHosts")
      : join(sb.env.XDG_CONFIG_HOME!, "chromium", "NativeMessagingHosts");
  await mkdir(chromiumDir, { recursive: true });
  await cp(join(chromeDir, `${HOST}.json`), join(chromiumDir, `${HOST}.json`));
}

// ---------- registry guard (Windows) ----------

async function readRegistryDefault(key: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const r = await run("reg", ["query", key, "/ve"]);
  if (r.code !== 0) return null;
  const m = /REG_SZ\s+(.+)\s*$/m.exec(r.stdout);
  return m ? m[1]!.trim() : null;
}

async function restoreRegistry(key: string, saved: string | null): Promise<void> {
  if (process.platform !== "win32") return;
  if (saved === null) await run("reg", ["delete", key, "/f"]);
  else await run("reg", ["add", key, "/ve", "/t", "REG_SZ", "/d", saved, "/f"]);
}

// ---------- the real side panel (driven over CDP) ----------

/**
 * Chrome's side panel isn't a Playwright Page, so attach to its target and
 * evaluate in it. Messages from it have no sender.tab, exactly like production.
 */
class RealSidePanel {
  private seq = 0;
  private readonly pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();

  private constructor(private readonly session: CDPSession, private readonly sessionId: string) {
    session.on("Target.receivedMessageFromTarget", (e: { sessionId: string; message: string }) => {
      if (e.sessionId !== this.sessionId) return;
      const m = JSON.parse(e.message) as { id?: number; result?: unknown; error?: { message: string } };
      if (typeof m.id === "number") this.pending.get(m.id)?.(m);
    });
  }

  static async open(ext: LaunchedExtension, opener: Page): Promise<RealSidePanel> {
    // sidePanel.open needs a user gesture: a real click in an extension page.
    await opener.evaluate(() => {
      document.body.addEventListener(
        "click",
        () => void chrome.windows.getCurrent().then((w) => chrome.sidePanel.open({ windowId: w.id! })),
        { once: true }
      );
    });
    await opener.locator("body").click({ position: { x: 2, y: 2 } });

    const browser = ext.context.browser();
    if (!browser) throw new Error("no browser handle");
    const session = await browser.newBrowserCDPSession();
    const panelUrl = `chrome-extension://${ext.extensionId}/src/sidepanel/index.html`;
    // Every Playwright page is a tab; the side panel is the panel target that isn't one of them.
    const tabTargets = new Set<string>();
    for (const page of ext.context.pages()) {
      const s = await ext.context.newCDPSession(page);
      const { targetInfo } = (await s.send("Target.getTargetInfo")) as { targetInfo: { targetId: string } };
      tabTargets.add(targetInfo.targetId);
      await s.detach();
    }
    let targetId: string | undefined;
    await expect
      .poll(async () => {
        const { targetInfos } = (await session.send("Target.getTargets")) as { targetInfos: { targetId: string; type: string; url: string }[] };
        targetId = targetInfos.find((t) => t.type === "page" && t.url === panelUrl && !tabTargets.has(t.targetId))?.targetId;
        return targetId;
      })
      .toBeTruthy();
    // Non-flat attach: Playwright's CDPSession can't address child sessions directly.
    const { sessionId } = (await session.send("Target.attachToTarget", { targetId: targetId!, flatten: false })) as { sessionId: string };
    return new RealSidePanel(session, sessionId);
  }

  async eval<T>(expression: string): Promise<T> {
    const id = ++this.seq;
    const reply = new Promise<{ result?: unknown; error?: { message: string } }>((resolve) => this.pending.set(id, resolve));
    await this.session.send("Target.sendMessageToTarget", {
      sessionId: this.sessionId,
      message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }),
    });
    const m = await reply;
    this.pending.delete(id);
    const r = m.result as { result: { value: T }; exceptionDetails?: unknown } | undefined;
    if (m.error || !r || r.exceptionDetails) throw new Error(`side panel eval failed: ${JSON.stringify(m.error ?? r?.exceptionDetails)}`);
    return r.result.value;
  }

  text(): Promise<string> {
    return this.eval<string>("document.body.innerText");
  }

  /** Click the first element matching a CSS selector whose text contains `hasText`. */
  async clickWhere(selector: string, hasText: string): Promise<void> {
    await this.clickFirst(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.textContent || "").includes(${JSON.stringify(hasText)}))`,
      `${selector} with "${hasText}"`
    );
  }

  /** Click the first button whose aria-label or text matches exactly. */
  async click(label: string): Promise<void> {
    await this.clickFirst(
      `[...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim() === ${JSON.stringify(label)})`,
      `button "${label}"`
    );
  }

  /** Waits (like a Playwright locator) for the element to exist, then clicks it once. */
  private async clickFirst(findExpr: string, what: string): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await this.eval<boolean>(`(() => { const el = ${findExpr}; if (!el) return false; el.click(); return true; })()`)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`side panel has no ${what}. Text:\n${await this.text()}`);
  }
}

// ---------- a minimal MCP client (what Claude Code does over stdio) ----------

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

class McpClient {
  private nextId = 1;
  private readonly waiting = new Map<number, (msg: { result?: unknown; error?: { message: string } }) => void>();
  readonly stderr: string[] = [];

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {
    createInterface({ input: child.stdout }).on("line", (line) => {
      const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
      if (typeof msg.id === "number") this.waiting.get(msg.id)?.(msg);
    });
    child.stderr.on("data", (d: Buffer) => this.stderr.push(d.toString()));
  }

  static async start(bundle: string, env: Record<string, string>): Promise<McpClient> {
    const child = spawn(process.execPath, [bundle, "mcp"], { env: { ...process.env, ...env }, windowsHide: true });
    const client = new McpClient(child);
    const init = (await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "0" },
    })) as { protocolVersion: string; serverInfo: { name: string } };
    expect(init.protocolVersion).toBe("2025-06-18");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return client;
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out. stderr: ${this.stderr.join("")}`)), 20_000);
      this.waiting.set(id, (msg) => {
        clearTimeout(timer);
        this.waiting.delete(id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return (await this.request("tools/call", { name, arguments: args })) as ToolResult;
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    await new Promise((r) => this.child.once("exit", r));
  }
}

/** A task's real id, read from the outline row's DOM id (row-<id>). */
async function taskIdByTitle(page: Page, title: string): Promise<string> {
  const id = await page.getByRole("treeitem").filter({ hasText: title }).first().getAttribute("id");
  if (!id?.startsWith("row-")) throw new Error(`no row for ${title}`);
  return id.slice(4);
}

const text = (r: ToolResult) => r.content.map((c) => c.text).join("\n");

/** Pull the id for a task title out of list_open_subtasks output. */
function idFor(listing: string, title: string): string {
  const line = listing.split("\n").find((l) => l.includes(`] ${title}`));
  const id = line && /id: ([A-Za-z0-9_-]+)/.exec(line)?.[1];
  if (!id) throw new Error(`no id for "${title}" in:\n${listing}`);
  return id;
}

// ---------- the test ----------

test.describe.configure({ mode: "serial" });

test("an agent reads the brief and checks off a subtask; the side panel updates live", async ({}, info) => {
  test.setTimeout(120_000);
  const savedRegistry = await readRegistryDefault(REG_KEY);
  const sb = await makeSandbox();
  let ext: LaunchedExtension | undefined;
  let mcp: McpClient | undefined;
  try {
    ext = await launchExtension(sb.extDir, { env: sb.env });
    const { page: panel, errors } = await openPanel(ext);

    // 1. The user plans work and starts a task.
    await createWorkflow(panel, "Agent bridge launch", ["Ship the agent bridge", "  Write the e2e test", "  Update the README", "Announce it"].join("\n"));
    const row = panel.getByRole("treeitem").filter({ hasText: "Ship the agent bridge" });
    await row.hover();
    await row.getByRole("button", { name: "Work on Ship the agent bridge" }).click();
    await expect(resumeCard(panel)).toContainText("Ship the agent bridge");

    // 2. Bridge permission is on but nothing is installed yet.
    const side = await RealSidePanel.open(ext, panel);
    await side.click("All workflows");
    await side.click("Settings");
    await expect.poll(() => side.text()).toContain("Bridge not installed yet");
    await expect.poll(() => side.text()).toContain(`install --extension-id ${ext.extensionId}`);

    // 3. Installed for the wrong extension: Chrome refuses, the card says so.
    const wrong = await bridgeCli(sb, "install", "--extension-id", WRONG_ID);
    expect(wrong.code, wrong.stderr).toBe(0);
    await mirrorManifestForChromium(sb);
    await side.click("Check again");
    await expect.poll(() => side.text()).toContain("installed for a different extension ID");

    // 4. The command from the card (with this extension's ID): connected.
    const install = await bridgeCli(sb, "install", "--extension-id", ext.extensionId);
    expect(install.code, install.stderr).toBe(0);
    expect(install.stdout).toContain("claude mcp add");
    expect(install.stdout).toContain(sb.stableBundle);
    await mirrorManifestForChromium(sb);
    expect((await bridgeCli(sb, "status")).stdout).toContain(ext.extensionId);
    await side.click("Check again");
    await expect.poll(() => side.text()).toContain("Connected · bridge 0.3.0");
    expect(existsSync(sb.stableBundle)).toBe(true);

    // The user goes back to the task view in the side panel and leaves it open.
    await side.click("Back");
    await side.clickWhere(".wf-card", "Agent bridge launch");
    await expect.poll(() => side.eval<boolean>(`!!document.querySelector('[aria-label="Complete Write the e2e test"]')`)).toBe(true);

    // 5. The agent connects the way `claude mcp add` configures it.
    mcp = await McpClient.start(sb.stableBundle, sb.env);
    const tools = (await mcp.request("tools/list", {})) as { tools: { name: string }[] };
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["add_subtask", "complete_task", "get_current_task", "list_open_subtasks", "log_decision"]);

    const brief = await mcp.call("get_current_task");
    expect(brief.isError ?? false).toBe(false);
    expect(text(brief)).toContain("Ship the agent bridge");
    expect(text(brief)).toContain("Write the e2e test");
    expect(text(brief)).not.toContain("Announce it"); // other tasks aren't the agent's business

    const open = text(await mcp.call("list_open_subtasks"));
    const testId = idFor(open, "Write the e2e test");

    // 6. The agent finishes a subtask: both the tab and the real side panel update without a reload.
    const done = await mcp.call("complete_task", { task_id: testId });
    expect(done.isError ?? false).toBe(false);
    // Finished subtasks fold into the group's "done" line.
    await expect(panel.getByRole("button", { name: "Show 1 done in Ship the agent bridge" })).toBeVisible();
    await expect(panel.getByLabel("1 of 3 tasks done")).toBeVisible();
    await expect.poll(() => side.eval<boolean>(`!!document.querySelector('[aria-label="Show 1 done in Ship the agent bridge"]')`)).toBe(true);

    // 7. Adds a follow-up and logs why.
    const added = await mcp.call("add_subtask", { title: "Record a demo GIF" });
    expect(text(added)).toContain("Record a demo GIF");
    await expect(panel.getByRole("treeitem").filter({ hasText: "Record a demo GIF" })).toBeVisible();
    const decision = await mcp.call("log_decision", { text: "Test the bridge through real native messaging, not mocks" });
    expect(decision.isError ?? false).toBe(false);
    await openNotes(panel);
    await expect(panel.getByRole("region", { name: "Details for Ship the agent bridge" })).toContainText("Test the bridge through real native messaging");

    // 8. Guard rails hold end to end.
    const outOfScope = await mcp.call("complete_task", { task_id: await taskIdByTitle(panel, "Announce it") });
    expect(outOfScope.isError).toBe(true);
    expect(text(outOfScope)).toMatch(/current task/i);
    await expect(panel.getByRole("button", { name: "Complete Announce it" })).toBeVisible();
    const parentWithOpenKids = await mcp.call("complete_task", { task_id: await taskIdByTitle(panel, "Ship the agent bridge") });
    expect(parentWithOpenKids.isError).toBe(true);
    await expect(panel.getByRole("button", { name: "Complete Ship the agent bridge" })).toBeVisible();
    const notFound = await mcp.call("complete_task", { task_id: "does-not-exist" });
    expect(notFound.isError).toBe(true);
    const multiline = await mcp.call("add_subtask", { title: "line one\nline two" });
    expect(multiline.isError).toBe(true);
    const extraKey = await mcp.call("add_subtask", { title: "ok", priority: "high" });
    expect(extraKey.isError).toBe(true);
    await expect(panel.getByRole("treeitem").filter({ hasText: "line one" })).toHaveCount(0);

    // 9. The side panel never logged an error.
    expect(errors).toEqual([]);

    // 10. Chrome closes: the agent gets a clear message instead of hanging.
    await ext.close();
    ext = undefined;
    const gone = await mcp.call("get_current_task");
    expect(gone.isError).toBe(true);
    expect(text(gone)).toContain("Orion Waypoint isn't reachable");
  } finally {
    await mcp?.close().catch(() => undefined);
    await ext?.close().catch(() => undefined);
    const un = await bridgeCli(sb, "uninstall");
    info.annotations.push({ type: "uninstall", description: un.stdout.trim() });
    await restoreRegistry(REG_KEY, savedRegistry);
    await rm(sb.root, { recursive: true, force: true }).catch(() => undefined);
  }
  if (process.platform === "win32") expect(await readRegistryDefault(REG_KEY)).toBe(savedRegistry);
});

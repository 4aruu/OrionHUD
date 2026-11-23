# OrionHUD

**Pick up exactly where you left off.** A Chrome side-panel extension for developers who build with several AIs at once: your milestones and nested subtasks, the tabs and AI threads behind each one, and a handoff brief any AI or agent can pick up. All saved automatically when you get interrupted, all kept on your machine.

Why it exists, and how it differs from tab managers, AI-memory plugins and agent memory servers: [docs/research/2026-11-23-competitive-landscape.md](docs/research/2026-11-23-competitive-landscape.md).

## What it does

| | |
|---|---|
| **Save points** | Recorded when you switch tasks, pause, go idle for 5 min, lock the screen, or the browser restarts after a crash. Each one holds your *next step*, the task's tabs, and when/why it was saved. Manual: `Alt+Shift+S` from any page. |
| **Resume card** | When you come back: "Welcome back · saved 42 min ago when you stepped away", the breadcrumb (`Auth refactor › Token refresh › Write retry test`), your next step, which AI threads you had open, **Reopen tabs** (as a named tab group) and **Copy brief**. The toolbar icon shows ↩ while a resume card is waiting. |
| **Outliner** | Subtasks on subtasks (8 levels), fully keyboard driven. Progress rolls up from leaves. Finishing a task suggests what's next; finishing the last child offers to close the parent. Paste a bulleted plan from any AI chat and it becomes a task tree. |
| **Milestones** | Flag any task (`m`). A strip at the top shows progress per milestone so the big picture survives while you're deep in a leaf. |
| **Decisions** | Select text in any AI reply or page → right-click → **Pin to OrionHUD as a decision**. Itemized and append-only on purpose. |
| **Inbox** | `Alt+Shift+Q` on any page parks a side quest without leaving your task. Triage later into a task or subtask. |
| **Handoff brief** | `c` (or Copy brief) puts a compact Markdown context block on your clipboard: path, milestone, progress, next step, decisions, open subtasks, links. Paste it into Claude, ChatGPT, Cursor, anything. |
| **Timebox & distraction guard** | Optional per task timer; optional nudge after a grace period on sites you list. |
| **Agent bridge** (optional) | Claude Code, Cursor or any MCP client can read your current task's brief, add and check off its subtasks, and log decisions. Changes show up in the panel immediately. See [Agent bridge](#agent-bridge-claude-code-cursor). |
| **Backup** | Export/import everything as JSON (Settings). |

### Keyboard (task list focused)

`↑↓` move · `←→` collapse/expand · `Enter` new task · `Shift+Enter` new subtask · `Tab`/`Shift+Tab` nest/un-nest · `Alt+↑↓` reorder · `Space` complete · `e`/`F2` rename · `.` work on this (saves where you were) · `m` milestone · `c` copy brief · `Delete` delete (undo) · `?` help

## Install (unpacked)

```powershell
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and pick the `dist/` folder. Pin the toolbar icon; clicking it opens the side panel. Requires Chrome 116+.

Optional: Settings → **Turn on tab memory** to let save points remember tabs (see Permissions).

## Agent bridge (Claude Code, Cursor)

A small local helper (`bridge/`, Node 18+, no dependencies) that gives coding agents five tools: `get_current_task` (the handoff brief), `list_open_subtasks`, `add_subtask`, `complete_task`, `log_decision`. Agents can only touch the task you're working on and its subtasks, and can't delete anything. Nothing leaves your computer except what the agent sends its model, same as a pasted brief.

Setup, once:

1. Build: `npm install` then `npm run build` (this also builds `bridge/dist/orion-bridge.mjs`). Reload the extension on `chrome://extensions`.
2. In the side panel: **Settings → Agent bridge → Turn on agent bridge**. Chrome asks to "Communicate with cooperating native applications".
3. Click **Copy install command** and run it in a terminal in the OrionHUD folder. It looks like this, with your extension's ID:

   ```powershell
   npx --yes --package=./bridge orionhud-bridge install --extension-id abcdefghijklmnopabcdefghijklmnop
   ```

   It copies the bridge to a per-user folder (`%LOCALAPPDATA%\OrionHUD\bridge`, `~/Library/Application Support/OrionHUD/bridge`, or `~/.local/share/orionhud/bridge`), registers it with Chrome for that one extension ID (Windows: a key under `HKCU\Software\Google\Chrome\NativeMessagingHosts`; macOS/Linux: a JSON file in Chrome's `NativeMessagingHosts` folder), and prints the exact command for the next step.
4. Back in Settings, click **Check again**. It should say **Connected**.
5. Add it to your agent with the line the installer printed, for example:

   ```powershell
   claude mcp add --scope user orionhud -- "C:\Program Files\nodejs\node.exe" C:\Users\you\AppData\Local\OrionHUD\bridge\orion-bridge.mjs mcp
   ```

   Cursor: add the printed `mcpServers.orionhud` entry to `~/.cursor/mcp.json`.

Other commands: `npx --package=./bridge orionhud-bridge status` (what's installed, is Chrome connected) and `… uninstall` (removes the files and the registration; then `claude mcp remove orionhud`).

Notes:

- An unpacked extension's ID depends on the folder you loaded it from. If you move `dist/`, Settings says the bridge is installed for a different extension ID: run the install command again.
- While the bridge is on, Chrome keeps OrionHUD's background worker running so it can answer. Turn the bridge off in Settings to stop it.
- Don't run `npx orionhud-bridge` from the npm registry: this project hasn't published that name. Always use `--package=./bridge`.
- Security design: [docs/bridge-threat-model.md](docs/bridge-threat-model.md).

## Permissions, and why

| Permission | Why | Install warning |
|---|---|---|
| `storage`, `unlimitedStorage` | Your data, in IndexedDB; never evicted | none |
| `sidePanel` | The UI | none |
| `alarms` | Timeboxes, rolling tab snapshot | none |
| `idle` | Auto save point when you step away | none |
| `activeTab`, `scripting` | Show the capture box on the tab where you pressed the shortcut, nowhere else | none |
| `contextMenus` | "Pin as decision" / "Send to inbox" on selected text | none |
| `notifications` | Time's up, confirmations | none |
| `tabGroups` | Reopen a task's tabs as one named group | none |
| `tabs` (**optional**, asked when you turn on tab memory) | Read tab URLs/titles for save points and the distraction guard | "Read your browsing history" |
| `nativeMessaging` (**optional**, asked when you turn on the agent bridge) | Talk to the local bridge helper you installed | "Communicate with cooperating native applications" |

No host permissions. No content scripts injected automatically. No network requests: no analytics, no remote fonts, no servers. The agent bridge is local only: a per-user socket on this computer. See [PRIVACY.md](PRIVACY.md).

## Architecture

```
src/shared/      pure logic + storage (no chrome.* except alarms.ts)
  types.ts         domain model
  normalize.ts     trust boundary for stored/imported data
  db.ts            IndexedDB; atomic read-modify-write in one transaction
  taskTree.ts      immutable tree ops (indent/outdent/move/progress/next-up)
  savePoints.ts    URL allowlist, AI-thread detection, resume rules
  brief.ts         handoff brief (Markdown)
  outline.ts       paste-an-outline parser
  workflowActions.ts  use-cases; validates every user string
  bridgeProtocol.ts   agent bridge wire format + parsers (shared with bridge/)
  bridgeService.ts    runs bridge requests, scoped to the active task
src/platform/tabs.ts   chrome.tabs/tabGroups capture + restore
src/platform/bridge.ts nativeMessaging permission + bridge status (storage.session)
src/background/  service worker: listeners only, no in-memory state
src/content/capture.ts  on-demand capture box (closed shadow DOM, no innerHTML)
src/sidepanel/   React UI (components/, hooks/, lib/)
dev/             harness: the real panel in a normal tab with a chrome.* shim
bridge/          agent bridge (Node): MCP server + native-messaging host + installer
  src/framing.ts   4-byte length-prefixed JSON frames
  src/mcp.ts       stdio MCP server (JSON-RPC); the 5 tools are in tools.ts
  src/host.ts      native host: socket ⇄ Chrome relay, token auth
  src/install.ts   host manifest, launcher, registry
```

The agent bridge path: agent → `orion-bridge mcp` (stdio) → local socket with a per-session token → `orion-bridge native-host` (started by Chrome) → service worker → `workflowActions` → IndexedDB. The extension stays the only writer. Design: [docs/superpowers/specs/2026-11-23-agent-bridge-design.md](docs/superpowers/specs/2026-11-23-agent-bridge-design.md).

Reliability decisions worth knowing:

- **Two writers, one truth.** The side panel and the service worker are separate JS contexts. Every mutation does get+put inside one IndexedDB readwrite transaction, which the browser serializes across connections (`test/db.test.ts` proves it with two independent connections, plus a control test showing a naive get-then-put loses writes).
- **The worker can die anytime.** Nothing lives in memory; every handler reads from storage.
- **Old or corrupt data degrades, never crashes.** `normalize.ts` defaults new fields for v0.1 data, drops malformed nodes, caps depth (8) and size (500 nodes), and strips unsafe URLs.
- **Crash recovery.** With tab memory on, a rolling snapshot of the active task's tabs is refreshed every 2 min; on browser start it becomes a "browser restarted" save point.

## Development

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run harness
```

`npm run test:e2e` builds, then drives the built extension in Playwright's Chromium (first time: `npx playwright install chromium`). Each test gets a fresh browser profile.

- `e2e/panel.e2e.ts`: the side panel in a real extension page. Covers first run, creating a workflow from a pasted outline, complete and reopen, adding tasks, starting, switching and pausing with next steps, notes and decisions, the inbox, reload persistence, Copy brief, backup export/delete/import, rejecting a bad backup file, and the shortcut help. Fails on any console error.
- `e2e/bridge.e2e.ts`: the agent bridge with nothing mocked. It runs the real `orionhud-bridge install` (first with a wrong extension ID, which must show "different extension ID"), lets Chromium start the native host, and connects an MCP client to `orionhud-bridge mcp` the way Claude Code does. The agent then reads the brief, completes a subtask, adds one and logs a decision. Chrome's real side panel (driven over CDP) updates live without a reload. Scope, open-children, bad-input and "Chrome closed" errors are checked end to end.

  What the bridge test touches: bridge files go to a temporary folder, but on Windows Chrome only looks in the registry, so the test writes `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.orionhud.bridge`. Any existing value is saved first and restored afterwards. The extension copy used by this test has `nativeMessaging` granted up front, because automation can't click Chrome's permission prompt. That prompt is the one step still covered only by the manual checklist below.

`npm run harness` serves the real side panel at `http://localhost:5199` with a `chrome.*` shim. Open `/?reset&seed` for demo data (a task you "left" 42 minutes ago). The shim and seed live in `dev/` and are never bundled into `dist/`.

## Manual QA checklist (real Chrome, before a release)

1. Load `dist/`; no errors on `chrome://extensions` (service worker "Inspect" console is clean).
2. Create a workflow by pasting a Markdown plan; tree matches indentation.
3. Start a task (`.`), switch to another, enter a next step; old task shows the amber dot; Inspector lists the save point.
4. Settings → Turn on tab memory → accept. Switch again; save point lists tabs; AI chat tabs show their vendor.
5. Lock the screen for 5+ min (or `chrome://extensions` → service worker → run `chrome.idle` test); reopen panel: welcome card, ↩ badge on icon.
6. Reopen tabs → a purple group named after the task.
7. `Alt+Shift+S` on a normal page: capture box appears, Enter saves. On `chrome://settings`: notification instead.
8. `Alt+Shift+Q`: inbox item appears with source link.
9. Select text → right-click → Pin as decision; appears under Decisions with "source".
10. Copy brief → paste into a chat; Markdown is intact.
11. Export backup, delete the workflow, import the backup; everything returns (tasks come back paused).
12. Quit Chrome with tab memory on, restart: "browser restarted" save point with tabs.

### Agent bridge checklist (real Chrome + Claude Code)

1. Fresh build loaded; Settings → Agent bridge shows **Turn on agent bridge** only. Service worker console is clean.
2. Turn it on, accept Chrome's prompt. Status reads "Bridge not installed yet" and shows the install command with this extension's ID.
3. Run the copied command in the repo folder. It prints the manifest path and a `claude mcp add …` line. Click **Check again** → **Connected · bridge 0.3.0**.
4. `npx --package=./bridge orionhud-bridge status` → "Chrome is connected (host running)".
5. Run the printed `claude mcp add …` line. In a new Claude Code session, `/mcp` lists **orionhud** as connected with 5 tools.
6. In the panel, create a task with two subtasks and start it (`.`). Ask Claude Code: "Use OrionHUD to get my current task." It calls `get_current_task`; the text matches **Copy brief**.
7. Ask: "List my open subtasks, then complete the first one." It calls `list_open_subtasks` then `complete_task`. **With the side panel open, the subtask shows as done within a second, without reloading**, and progress rolls up.
8. Ask it to "log a decision: use exponential backoff". It appears under Decisions on the task.
9. Ask it to add a subtask. It appears under the current task.
10. Ask it to complete a task in a different branch (give it that task's title). It gets a scope error; that task is unchanged.
11. Ask it to complete the parent while a child is still open: "still open" error; nothing changes.
12. Pause the workflow in the panel. `get_current_task` now says no task is active.
13. Quit Chrome. The next tool call says OrionHUD isn't reachable, without hanging. Reopen Chrome: Settings shows Connected again by itself, and tools work.
14. Reload the extension on `chrome://extensions`; tools keep working without restarting Claude Code.
15. Settings → **Turn off agent bridge**: status off, tools report unreachable, `status` says Chrome isn't connected.
16. `… orionhud-bridge uninstall`: the manifest/registry key and the per-user folder are gone; turning the bridge back on shows "not installed".

## Roadmap

- **v0.3: agent bridge.** Shipped; see [Agent bridge](#agent-bridge-claude-code-cursor). Next: publish `orionhud-bridge` to npm under the project's account so `npx orionhud-bridge` works without the repo.
- On-device summaries of long AI threads via Chrome's Summarizer API where hardware allows.
- Chrome Web Store listing (privacy policy is ready in `PRIVACY.md`).

Not planned: cloud sync, accounts, Firefox.

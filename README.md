# Orion Waypoint

<img src="icons/icon128.png" alt="Orion Waypoint icon" width="96" />

**Got pulled away? Pick up exactly where you left off.**

A Chrome side-panel extension for developers who build with several AIs at once: your milestones and nested subtasks, the tabs and AI threads behind each one, and a handoff brief any AI or agent can pick up. All saved automatically when you get interrupted, all kept on your machine.

Why it exists, and how it differs from tab managers, AI-memory plugins and agent memory servers: [docs/research/2026-11-23-competitive-landscape.md](docs/research/2026-11-23-competitive-landscape.md).

## What it does

| | |
|---|---|
| **Save points** | Recorded when you switch tasks, pause, go idle for 5 min, lock the screen, or the browser restarts after a crash. Each one holds your *next step*, the task's tabs, and when/why it was saved. Manual: `Alt+Shift+S` from any page. |
| **Resume card** | When you come back: "Welcome back · saved 42 min ago when you stepped away", the breadcrumb (`Auth refactor › Token refresh › Write retry test`), your next step, which AI threads you had open, **Reopen tabs** (as a named tab group) and **Copy brief**. The toolbar icon shows ↩ while a resume card is waiting. |
| **Outliner** | Subtasks on subtasks (8 levels), fully keyboard driven. Progress rolls up from leaves. Finishing a task suggests what's next; finishing the last child offers to close the parent. Paste a bulleted plan from any AI chat and it becomes a task tree. |
| **Milestones** | Flag any task (`m`). A strip at the top shows progress per milestone so the big picture survives while you're deep in a leaf. |
| **Decisions** | Select text in any AI reply or page → right-click → **Pin as a decision (Orion Waypoint)**. Itemized and append-only on purpose. |
| **Inbox** | `Alt+Shift+Q` on any page parks a side quest without leaving your task. Triage later into a task or subtask. |
| **Handoff brief** | `c` (or Copy brief) puts a compact Markdown context block on your clipboard: path, milestone, progress, next step, decisions, open subtasks, links. Paste it into Claude, ChatGPT, Cursor, anything. |
| **Timebox & distraction guard** | Optional per task timer; optional nudge after a grace period on sites you list. |
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

No host permissions. No content scripts injected automatically. No network requests: no analytics, no remote fonts, no servers. See [PRIVACY.md](PRIVACY.md).

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
src/platform/tabs.ts   chrome.tabs/tabGroups capture + restore
src/background/  service worker: listeners only, no in-memory state
src/content/capture.ts  on-demand capture box (closed shadow DOM, no innerHTML)
src/sidepanel/   React UI (components/, hooks/, lib/)
dev/             harness: the real panel in a normal tab with a chrome.* shim
```

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
npm run harness
npm run icons
```

`npm run icons` regenerates `icons/*.png` from `icons/src/*.svg`.

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

## Roadmap

- **v0.3: agent bridge.** A small `npx` companion (MCP server + native messaging) so Claude Code / Cursor can read the current task and brief, check off subtasks, and log decisions in the same tree. The brief format in `brief.ts` is its contract.
- On-device summaries of long AI threads via Chrome's Summarizer API where hardware allows.
- Chrome Web Store listing (privacy policy is ready in `PRIVACY.md`).

Not planned: cloud sync, accounts, Firefox.

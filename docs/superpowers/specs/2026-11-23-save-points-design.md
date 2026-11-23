# OrionHUD: Save Points — Design

Date: 2026-11-23 · Status: approved ("do all the stuff"), v1 scope locked below

## v1 scope (final, supersedes anything below that conflicts)

Priorities set by the owner: **ease of use, reliability, security**. Research
backing: `docs/research/2026-11-23-competitive-landscape.md`.

In v1:
- Save points (auto on switch/idle/stop/complete, manual `Alt+Shift+S`) + resume card.
- Outliner task tree: unlimited-feel nesting (cap 8), keyboard-first, leaf progress rollup, milestones strip, "next up" after completing.
- AI-aware tab memory: saved tabs are classified (`ai-thread` vs `page`, vendor name) so the resume card shows "your Claude thread", "your ChatGPT thread" first.
- Decision log: right-click a selection on any page → **Pin as decision** (or **Send to inbox**). No host permission needed (`contextMenus` gives `selectionText`).
- Side-quest inbox: `Alt+Shift+Q` capture box injected via `activeTab`.
- Handoff brief: one click copies a Markdown brief (path, next step, decisions, open subtasks, links) to paste into any AI or agent. This format is the contract the v2 agent bridge will serve.
- Backup: export/import all workflows as JSON (validated on import).

Moved to v2 (reason: ease of use and reliability come first):
- Agent bridge (MCP via `npx`): second install + native messaging = more failure modes. v1's brief format is designed as its contract.
- On-device AI summaries (Chrome Summarizer API): hardware-gated (16 GB RAM / 4 GB VRAM), so it can't be a core path.

Reliability changes:
- Workflow and meta read-modify-write run inside **one IndexedDB readwrite transaction**. The existing in-memory lock only serializes callers inside one JS context; the side panel and the service worker are two contexts and could overwrite each other.
- Deep validation/normalization of stored data on every read (corrupt or old data degrades, never crashes).
- `unlimitedStorage` so Chrome never evicts the user's data.

Security changes:
- Drop optional `<all_urls>` entirely. One optional permission, `tabs`, powers both tab memory and the distraction guard ("Read your browsing history" instead of "Read and change all your data on all websites").
- Validate `sender.id` on every runtime message; parse every message through typed guards.
- URL scheme allowlist (`http:`/`https:` only) at save time **and** at restore time.
- No `innerHTML`/`dangerouslySetInnerHTML`; capture box is vanilla DOM in a closed shadow root using `textContent`.
- Remove remote Google Fonts (privacy leak on every panel open, breaks offline); system font stack.
- Length caps on every user string; import capped at 5 MB and fully validated.

## Intent

Developers lose their place mid-work: a meeting, a Slack ping, a context
switch to a bug, a closed laptop. Coming back, the expensive part is not
"what was the project" but "what exactly was I about to do, and where were
the tabs I needed". OrionHUD's job is to make **resuming** cheap: one glance
tells you the milestone, the exact subtask, your own note on the next step,
and one click restores the tabs.

Today OrionHUD is built around policing (timers, distraction guard). Those
stay, but they become secondary to resume.

## Goals

1. **Save points.** Leaving a task (switch task, idle/lock, stop workflow,
   `Alt+Shift+S`) records: task path, a one-line "next step" (optional),
   the task's tabs (if permitted), timestamp, and trigger.
2. **Resume card.** On return (idle→active, browser start, panel open with a
   stale session) the panel leads with: breadcrumb path, the next step,
   time away, latest notes, and **Reopen N tabs** (as a named tab group).
3. **Outliner-grade task tree.** Unlimited nesting (capped for sanity),
   keyboard-first editing, progress rolled up from leaves, collapse/expand,
   current path highlighted, "what's next" suggestion after completing.
4. **Milestones.** Any node can be flagged. A strip at the top shows
   milestone progress so the big picture is visible while deep in a leaf.
5. **Side-quest inbox.** `Alt+Shift+Q` on any page opens a tiny capture box
   (injected via `activeTab`, no host permission); the thought lands in the
   active workflow's inbox, tagged with the current task and source URL.
   Triage later: promote to subtask or dismiss.
6. **Crash-safe.** If the tabs permission is granted, the background keeps a
   throttled rolling snapshot of the active task's tabs, so a browser crash
   or force-quit still resumes correctly.

## Non-goals

- Cloud sync, accounts, team sharing.
- AI summaries of what you were doing.
- Firefox / Safari.
- Capturing page content, scroll position, or form state (URL + title only).
- Git/IDE integration (good follow-up, separate project).

## Anti-goals (would be failure even if it "works")

- Prompting so often it becomes noise. The next-step prompt is one field,
  skippable with Esc, and never shown for idle-triggered saves (you're not
  there); the resume card offers to add it instead.
- Install-time scary permission warnings. Nothing new at install.
- Losing data on a service-worker kill. Every mutation is written
  immediately (existing invariant, kept).
- A UI that needs the mouse for the core loop.

## Constraints (from the existing codebase)

- MV3, Vite + `@crxjs/vite-plugin`, React 19, IndexedDB via `idb`, Vitest.
- Service worker can die anytime: no in-memory state that matters.
- Pure logic stays in `src/shared/*` with no `chrome.*` calls, so it's unit
  testable in Node; `chrome.*` plumbing stays thin.
- Per-key locks in `db.ts` for every read-modify-write.
- `parseMeta`/`parseWorkflow` drop unknown fields → new fields must be added
  there, and old stored data must be normalized (no DB version bump needed:
  nodes live inside the workflow record).
- No static `tabs` permission (existing decision, kept).

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **A. Evolve OrionHUD around save points** (chosen) | Reuses storage, alarms, guard, side panel; needs App.tsx split and a tree-ops layer | Picked: everything hard (storage, locking, MV3 lifecycle) already exists and is tested |
| B. New standalone "resume" extension | Clean slate, but re-derives locking/lifecycle work and throws away tested code | Rejected |
| C. Web app + tiny extension bridge | Cross-device, but needs a backend/auth, contradicts local-only privacy stance | Rejected for now; possible later via export |

Tab-permission sub-decision (approved): request optional `tabs` on the first
"Save tabs" click (Chrome shows "Read your browsing history" then). If the
user already granted the optional `<all_urls>` for the Distraction Guard,
that already exposes tab URLs and no second prompt is needed. `tabGroups` is
added as a required permission (it carries no install warning). Declining
degrades gracefully: save points still record path + next step + the active
tab only (via `activeTab` when triggered by the shortcut/action).

## Decisions on the how

- **Data model**
  - `ITaskNode` gains `isMilestone: boolean`, `collapsed: boolean`,
    `savePoints: ISavePoint[]` (newest first, capped at 10).
  - `ISavePoint { id, createdAt, trigger: "switch"|"idle"|"manual"|"stop"|"startup", nextStep: string|null, tabs: ISavedTab[], tabsSource: "all"|"active-only"|"none" }`
  - `ISavedTab { url, title }` — http/https/file only, deduped, max 30.
  - `IWorkflowState` gains `inbox: IInboxItem[]`
    (`{ id, text, createdAt, taskId|null, sourceUrl|null }`, max 100).
  - `IAppMeta` gains `lastResumeShownAt: number|null`.
  - Rolling tab snapshot stored under meta store key `liveSnapshot`
    (`{ workflowId, taskId, tabs, updatedAt }`).
- **Task statuses:** switching away sets the old task back to `PENDING`
  (with a save point); only one `ACTIVE` node per workflow. This also fixes
  an existing bug where "▶" moved the pointer but left statuses/alarms
  untouched.
- **Progress** = done leaves / total leaves under a node.
- **Parent completion:** completing a parent with open children asks
  "Complete N open subtasks too?"; completing the last open child offers to
  complete the parent.
- **"What's next"** after completing = first `PENDING` leaf in document order
  after the completed node, within the same top-level milestone first.
- **Limits:** max depth 8, max 500 nodes per workflow (raised from 200, now
  counted across the whole tree, not just roots).
- **Keyboard (outline focus):** ↑/↓ move focus · ←/→ collapse/expand ·
  Enter new sibling · Tab / Shift+Tab indent/outdent · Alt+↑/↓ reorder ·
  Space toggle done · `e`/F2 rename · `.` make active · `m` milestone ·
  Delete remove (5s undo toast) · `/` focus quick add.
- **Global shortcuts (manifest `commands`):** `Alt+Shift+S` save point,
  `Alt+Shift+Q` quick capture. User can rebind at `chrome://extensions/shortcuts`.
- **Resume trigger rules:** show the card when the panel opens/receives a
  state message AND the latest save point of the active task is newer than
  `lastResumeShownAt` AND time away ≥ 5 min (or trigger is `startup`).
- **UI structure:** `App.tsx` (840 lines) is split into components + hooks
  before features land, with no behavior change in that step.

## Left to the builder

- Exact visual styling (reuse current dark glass theme and CSS tokens in
  `index.css`).
- Undo toast implementation detail.
- Copy text, as long as it's short and verb-first.

## Builder-check calls (made by me, flagged for review)

- **"The task's tabs"** = tabs in the task's Chrome tab group if one exists
  (created by a previous Reopen), otherwise all normal tabs in the focused
  window. Pinned tabs and `chrome://`/extension pages are excluded.
- **Next-step prompt on switch** appears inline in the side panel row being
  left (one input, Enter saves, Esc skips); the switch happens either way.
- **No active workflow:** `Alt+Shift+S` opens the panel on the selector;
  `Alt+Shift+Q` shows an in-page toast "Start a workflow to capture".
- **Message contract:** `ORION_SHOW_RECOVERY` is replaced by
  `ORION_STATE_CHANGED` (no payload beyond a reason). The panel always
  derives the resume card from storage, so a closed panel misses nothing.
- **Reopen** creates the tabs in the current window, groups them, titles the
  group with the task title (truncated to 30 chars), and records the group
  id on nothing persistent (group ids don't survive restarts); matching is
  by title on the next save.
- **Migration:** old workflows get `inbox: []`, nodes get
  `isMilestone:false, collapsed:false, savePoints:[]` at parse time.

## Known limits (stated, not hidden)

- Browser-close itself can't be caught in MV3; the rolling snapshot covers
  it only when the tabs permission is granted.
- `chrome.sidePanel.open()` from a keyboard command depends on Chrome's
  user-gesture handling; if it fails, `Alt+Shift+S` falls back to the
  injected in-page prompt (same mechanism as quick capture).
- Loading the unpacked build in Chrome is a manual checkpoint; automated
  tests cover pure logic and storage only.

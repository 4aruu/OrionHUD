# OrionHUD v0.2 "Save Points" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn OrionHUD into the resume layer for AI-assisted dev work: save points, resume card, keyboard outliner with milestones, AI-aware tab memory, decision log, inbox, handoff brief.

**Architecture:** Pure logic in `src/shared/*` (no `chrome.*`, unit tested in Node). Thin `chrome.*` plumbing in `src/background/*`. Side panel split into focused React components. Storage stays IndexedDB, now with transaction-atomic read-modify-write.

**Tech Stack:** MV3, Vite 8 + `@crxjs/vite-plugin` 2, React 19, `idb`, Vitest + `fake-indexeddb`, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-11-23-save-points-design.md` (read the "v1 scope (final)" section first).

## Global Constraints

- No `chrome.*` calls in `src/shared/*` except `alarms.ts` (existing).
- Limits: maxNodes 500/workflow, maxDepth 8, nextStep 280 chars, savePoints 10/task, savedTabs 30/save point, inbox 100, url 2048 chars, tab title 200, import 5 MB.
- Only `http:` / `https:` URLs are stored or restored.
- No `innerHTML`, `dangerouslySetInnerHTML`, `eval`, remote scripts, remote fonts.
- Every runtime message: check `sender.id === chrome.runtime.id`, then `parseExtensionMessage`.
- IDs via `crypto.randomUUID()`.
- Manifest permissions: `storage, unlimitedStorage, alarms, idle, sidePanel, activeTab, scripting, notifications, contextMenus, tabGroups`; optional: `tabs`; no host permissions.
- Shortcuts: `Alt+Shift+S` save point, `Alt+Shift+Q` quick capture.

## Review Focus

1. Data written by v0.1 (no `inbox`, nodes without `savePoints`/`isMilestone`, notes without `kind`) must load and display, not crash. → Task 2 test `normalizes v0.1 workflow`.
2. Side panel and service worker writing the same workflow at once must not lose either write. → Task 2 test `concurrent mutate across connections keeps both writes`.
3. A malicious or odd tab URL (`javascript:`, `chrome://`, `file:`, 5 KB URL) must never be stored or reopened. → Task 3 tests on `sanitizeTabs` / `isRestorableUrl`.
4. Indent/outdent/delete on the active task or near the depth cap must keep exactly one ACTIVE node and valid `parentId`s. → Task 2 tree tests + Task 4 `switchTask` tests.
5. Importing a hand-edited or hostile JSON file must be rejected or sanitized, never partially written. → Task 4 test `importBackup rejects invalid file atomically`.

---

### Task 1: Baseline
**Files:** Create `.gitignore`, `src/vite-env.d.ts`. 
- [ ] `git init`, ignore `node_modules/ dist/ *.log .vite/`.
- [ ] `src/vite-env.d.ts`: `/// <reference types="vite/client" />` and `/// <reference types="@crxjs/vite-plugin/client" />`.
- [ ] Run `npm run typecheck` → 0 errors; `npm test` → 57 passed.
- [ ] Commit `chore: baseline, fix CSS import typing`.

### Task 2: Data model, normalization, atomic storage, tree ops
**Files:** Modify `src/shared/types.ts`, `src/shared/db.ts`, `src/shared/taskTree.ts`, `src/shared/validators.ts`. Create `src/shared/normalize.ts`. Tests: `test/normalize.test.ts`, `test/taskTree.test.ts`, `test/db.test.ts`.

**Interfaces (Produces):**
- types: `NoteKind = "note"|"decision"`; `IMicroNote += kind, sourceUrl: string|null`; `ISavedTab {url,title,kind:"ai-thread"|"page",vendor:string|null}`; `SavePointTrigger = "switch"|"idle"|"manual"|"stop"|"complete"`; `ISavePoint {id,createdAt,trigger,nextStep:string|null,tabs:ISavedTab[],tabsSource:"window"|"active"|"none"}`; `ITaskNode += isMilestone, collapsed, savePoints`; `IInboxItem {id,text,createdAt,taskId:string|null,sourceUrl:string|null}`; `IWorkflowState += inbox, createdAt`; `IAppMeta += lastResumeShownAt:number|null`.
- `normalizeWorkflow(raw: unknown): IWorkflowState | null`, `normalizeMeta(raw: unknown, now: number): IAppMeta`.
- db: `mutateWorkflow(id, fn)` and new `mutateMeta(fn: (m: IAppMeta) => IAppMeta): Promise<IAppMeta>` run get+put in ONE readwrite transaction; `listWorkflows(): Promise<IWorkflowState[]>`; `putWorkflows(list)` (single transaction, for import).
- taskTree: `findPath(nodes,id): ITaskNode[]`, `updateNode(nodes,id,fn)`, `insertNode(nodes,parentId,node,index?)`, `removeNode(nodes,id): {nodes, removed, parentId, index}`, `indentNode`, `outdentNode`, `moveNode(nodes,id,dir:-1|1)`, `leafProgress(nodes): {done,total}`, `countNodes`, `depthOf(nodes,id): number` (root = 1), `subtreeHeight(node)`, `nextPendingTask(nodes, afterId): ITaskNode|null`, `flattenVisible(nodes): {node, depth}[]`, `walk(nodes, fn)`.

- [ ] Tests first: v0.1 fixture normalizes with defaults; garbage nodes (missing id, non-array subTasks, depth 20) dropped/truncated; indent makes node last child of previous sibling and fixes `parentId`; indent of first sibling is no-op; outdent places node right after old parent; indent refused when result depth > 8; `nextPendingTask` returns next pending leaf in document order then wraps; `leafProgress` counts leaves only; concurrent `mutateWorkflow` from two separate `openDB` connections keeps both writes.
- [ ] Implement; `npm test` green; `npm run typecheck` clean.
- [ ] Commit `feat(core): v0.2 data model, normalization, atomic storage, tree ops`.

### Task 3: Save points, AI tab classification, brief, guards
**Files:** Create `src/shared/savePoints.ts`, `src/shared/brief.ts`. Modify `src/shared/messages.ts`. Tests: `test/savePoints.test.ts`, `test/brief.test.ts`, `test/messages.test.ts`.

**Produces:** `isRestorableUrl(url: unknown): url is string`; `classifyUrl(url): {kind, vendor}` (claude.ai→Claude, chatgpt.com/chat.openai.com→ChatGPT, gemini.google.com→Gemini, aistudio.google.com→AI Studio, copilot.microsoft.com→Copilot, github.com/copilot→GitHub Copilot, perplexity.ai→Perplexity, chat.deepseek.com→DeepSeek, grok.com→Grok, v0.dev / v0.app→v0, bolt.new→Bolt, lovable.dev→Lovable, cursor.com/agents→Cursor); `sanitizeTabs(raw: {url?,title?,pinned?}[]): ISavedTab[]` (drop pinned + non-restorable, dedupe by url, AI threads first, cap 30, clamp title 200); `buildSavePoint(input, now, id)`; `pushCapped<T>(list, item, cap)` (newest first); `shouldShowResume({latest, lastResumeShownAt, now})` (true if latest newer than lastShown and (now - latest.createdAt ≥ 5 min or trigger==="idle")); `formatAgo(ms)`; `buildBrief(workflow, taskId): string`.
Messages: `ORION_STATE_CHANGED {reason}`, `ORION_CAPTURE_SUBMIT {mode:"save"|"inbox", text}`; drop `ORION_SHOW_RECOVERY`, `ORION_TIMES_UP`.

- [ ] Tests first: `javascript:`, `data:`, `chrome://`, `file:`, `chrome-extension://`, 3000-char URL, non-string all rejected; dedupe; AI thread sorts first with vendor; brief contains breadcrumb `A › B › C`, next step, decisions newest first, open subtasks only, no tab titles beyond 10; message parser rejects wrong mode/oversized text (> 500).
- [ ] Implement; tests green. Commit `feat(core): save points, AI tab classification, handoff brief`.

### Task 4: Workflow actions
**Files:** Modify `src/shared/workflowActions.ts`, `test/workflowActions.test.ts`, `test/chromeMock.ts`.

**Produces (all `async`, all via `mutateWorkflow`/`mutateMeta`):** `createWorkflow` (unchanged signature), `addTask(wfId,parentId,title,opts)` (throws `OrionLimitError` on count/depth), `switchTask(wfId, toTaskId|null, capture: CaptureInput)` where `CaptureInput = {trigger, nextStep?, tabs?, tabsSource?}`, `startWorkflow(wfId, taskId)` (= switchTask + meta), `stopWorkflow(capture)`, `recordSavePoint(wfId, taskId, capture)`, `completeTask(wfId, taskId, {cascade}) → {nextTaskId}`, `reopenTask`, `renameTask`, `deleteTask → removed`, `restoreTask(wfId, removed)`, `indentTask`, `outdentTask`, `moveTask`, `toggleMilestone`, `toggleCollapsed`, `addNote(wfId, taskId, text, kind, sourceUrl)`, `addInboxItem(wfId, text, taskId, sourceUrl)`, `promoteInboxItem(wfId, itemId, parentId)`, `dismissInboxItem`, `markResumeShown(now)`, `exportBackup(): Promise<string>`, `importBackup(json: string): Promise<{imported:number}>`, `deleteWorkflowCascade(id)`.

- [ ] Tests first: switchTask leaves exactly one ACTIVE, records save point on the outgoing task, clears its alarm, schedules the new one, updates meta; completing a parent with open children and `cascade:false` throws, with `cascade:true` completes subtree; `nextTaskId` returned; delete+restore round-trips position; importBackup rejects invalid file without writing anything; inbox promote creates subtask and removes item.
- [ ] Implement; tests green. Commit `feat(core): workflow actions for switch, edit, notes, inbox, backup`.

### Task 5: Background service worker
**Files:** Rewrite `src/background/index.ts` (wiring only). Create `src/background/{router,capture,commands,menus,idle,guard,notify}.ts`. Replace `src/content/index.tsx` with `src/content/capture.ts` (vanilla DOM). Modify `manifest.json`, `src/background/timesUp.ts`.
- capture.ts: `hasTabsPermission()`, `captureTabs(): Promise<{tabs, source}>` (window tabs if permitted, else active tab URL if readable, else none), `restoreTabs(tabs, groupTitle)`.
- commands.ts: inject `capture.ts?script&iife` with mode set in isolated world via a preceding `executeScript({func,args})`; on failure (chrome:// pages) open side panel / show notification.
- menus.ts: `orion-pin-decision`, `orion-to-inbox` on `selection`.
- idle.ts: idle/locked → `recordSavePoint(... trigger:"idle")` + tabs; active → broadcast.
- router.ts: sender check, `ORION_CAPTURE_SUBMIT` handling.
- [ ] `npm run build` succeeds, `dist/manifest.json` has commands, no host permissions. Commit `feat(bg): commands, idle save points, context menus, tab memory`.

### Task 6: Side panel
**Files:** Rewrite `src/sidepanel/App.tsx` (router). Create `src/sidepanel/lib/{format,categories}.ts`, `src/sidepanel/hooks/useOrion.ts`, `src/sidepanel/components/{ErrorBoundary,WorkflowSelector,CreateWorkflowForm,WorkflowDetail,ActiveWorkflow,ResumeCard,MilestoneStrip,Outline,TaskInspector,InboxPanel,Toast,Settings,ShortcutHelp}.tsx`. Modify `index.css`, `index.html`.
- Keyboard (outline focused): ↑/↓, ←/→, Enter new sibling, Shift+Enter new child, Tab/Shift+Tab, Alt+↑/↓, Space done, e/F2 rename, `.` switch to task, m milestone, Delete (undo toast 6 s), `/` quick add, `?` help.
- Switching via `.` or ▶ shows inline "Next step when you're back?" (Enter save, Esc skip), then switches.
- [ ] `npm run typecheck`, `npm run build` green. Commit `feat(ui): outliner, resume card, milestones, inbox, settings`.

### Task 7: Security review, docs, release check
- [ ] `grep` for `innerHTML|dangerouslySetInnerHTML|eval\(|new Function` in `src` → none.
- [ ] `npm audit --omit=dev`; record result.
- [ ] Run `/security-review`-style pass over the diff; fix findings.
- [ ] Rewrite `README.md` (what it is, install unpacked, shortcuts, permissions and why, privacy, architecture, testing, roadmap). Update `docs/IMPLEMENTATION_PLAN.md` status.
- [ ] Final: `npm run typecheck && npm test && npm run build`. Manual QA checklist in README. Commit `docs: v0.2 README, QA checklist`.

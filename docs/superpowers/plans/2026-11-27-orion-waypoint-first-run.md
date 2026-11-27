# Orion Waypoint First Run + Beige Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A welcome tab on fresh install that ends in a real save point, plus a warm beige light theme across the panel, welcome page and capture box.

**Architecture:** One palette module (`src/shared/palette.ts`) is the single source of colour values; a hand-written `tokens.css` mirrors it (a test keeps them equal) and the capture box builds its stylesheet from it. Theme preference lives in `chrome.storage.local` (mirrored to `localStorage` for first paint). The welcome page is a second React entry (`src/welcome/`) whose step logic is a pure function and whose data actions are a small tested module; it renders the panel's `ResumeCard` in a new display-only `preview` mode.

**Tech Stack:** TypeScript 6, React 19, Vite 8 + @crxjs/vite-plugin 2, Vitest 4 (node env, `fake-indexeddb`), Manifest V3.

**Spec:** `docs/superpowers/specs/2026-11-27-orion-waypoint-first-run-design.md`

## Global Constraints

- Manifest V3, `minimum_chrome_version` "116". No new entries in `permissions` or `host_permissions`; `tabs` stays in `optional_permissions`.
- CSP `script-src 'self'`: no inline `<script>` in any HTML page.
- No network requests from any page; system fonts only; no remote code.
- Welcome tab opens only when `onInstalled` `reason === "install"`.
- `chrome.permissions.request` and `chrome.sidePanel.open` are called only synchronously inside click handlers.
- Every welcome step is skippable; "Open the panel" is always enabled.
- Text contrast ≥ 4.5:1 for every text/background pair used, in both themes.
- Feature-detect `chrome.sidePanel`, `chrome.action.getUserSettings`, `chrome.action.onUserSettingsChanged`.
- Respect reduced motion (existing `--dur-*` tokens, zeroed by the existing reduced-motion block).
- Commits: `type(orion-waypoint): …` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No "Generated with" line.
- Every task ends green on: `npm test` (includes `icons:check`), `npm run typecheck`, `npm run build`.

## Review Focus

1. **Shortcut pressed before step 1** (no workflow yet): background shows its existing "Start a workflow" notification; the welcome page must show step 3 as not current, with "Do step 1 first", never as done. → Task 5 test `save step waits for an active task`.
2. **Welcome reopened after onboarding** (Settings → Show welcome again, or a second visit): all finished steps show done, step 1 offers no "Start" that would create a duplicate workflow. → Task 5 test `reopened with an active task: step 1 done, no create`.
3. **Backup imported mid-welcome** (import resets ACTIVE → PENDING): step 1 flips to "pick" with recent tasks, and picking one makes step 3 reachable. → Task 5 tests `pick mode lists recent tasks` and `pickUpTask makes it active`.
4. **Corrupt or unknown stored theme value** (`"sepia"`, `42`, missing): treated as `"system"`, no throw. → Task 1 test `parseThemePref falls back to system`.
5. **Over-long answer in step 1** (121+ chars): rejected with the existing validation message and nothing is written. → Task 5 test `startFromWelcome rejects a long title and writes nothing`.

---

### Task 1: Palette and theme preference

**Files:**
- Create: `src/shared/palette.ts`, `src/shared/theme.ts`
- Test: `test/theme.test.ts`
- Modify: `PRIVACY.md` (one sentence: the theme choice is stored locally in the browser)

**Interfaces:**
- Produces:
  - `palette.ts`: `type TokenName = "bg" | "surface" | "surface-2" | "surface-raised" | "surface-hover" | "tooltip" | "hover" | "line" | "line-strong" | "line-hover" | "accent" | "accent-hover" | "accent-text" | "on-accent" | "accent-soft" | "accent-line" | "ok" | "red" | "red-soft" | "red-line" | "text" | "text-2" | "text-3" | "scrim" | "shadow-color"`; `const DARK: Record<TokenName, string>`; `const BEIGE: Record<TokenName, string>`; `function cssVars(p: Record<TokenName, string>): string` → `"--bg: #121315; --surface: …;"` (declarations only, keys in `TokenName` order).
  - `theme.ts`: `type ThemePref = "system" | "light" | "dark"`; `type ResolvedTheme = "light" | "dark"`; `const THEME_KEY = "orion-theme"`; `parseThemePref(raw: unknown): ThemePref`; `resolveTheme(pref: ThemePref, systemPrefersLight: boolean): ResolvedTheme`; `readThemePref(): Promise<ThemePref>` (from `chrome.storage.local`); `writeThemePref(pref: ThemePref): Promise<void>` (writes `chrome.storage.local` and the `localStorage` mirror, mirror write wrapped in try/catch); `applyTheme(pref: ThemePref, root?: HTMLElement): void` (sets `data-theme` to `"light"`/`"dark"`, removes it for `"system"`).

Values (DARK = today's `:root` in `src/sidepanel/index.css`; new roles take today's hard-coded values):

| Token | DARK | BEIGE |
|---|---|---|
| bg | `#121315` | `#f1ebdf` |
| surface | `#18191c` | `#f7f2e8` |
| surface-2 | `#1e2023` | `#e9e1d2` |
| surface-raised | `#222427` | `#fbf8f2` |
| surface-hover | `#232528` | `#e6ddcc` |
| tooltip | `#26282c` | `#fbf8f2` |
| hover | `rgba(255, 255, 255, 0.04)` | `rgba(60, 45, 20, 0.05)` |
| line | `#26282c` | `#ddd3c1` |
| line-strong | `#383b41` | `#c9bca5` |
| line-hover | `#4a4e55` | `#b5a68c` |
| accent | `#e8a33d` | `#e8a33d` |
| accent-hover | `#f0b155` | `#db9530` |
| accent-text | `#e8a33d` | `#8f5100` |
| on-accent | `#1a1408` | `#1a1408` |
| accent-soft | `rgba(232, 163, 61, 0.09)` | `rgba(232, 163, 61, 0.16)` |
| accent-line | `rgba(232, 163, 61, 0.5)` | `rgba(143, 81, 0, 0.45)` |
| ok | `#8fbf96` | `#356a3e` |
| red | `#f08a7a` | `#b3261e` |
| red-soft | `rgba(240, 138, 122, 0.1)` | `rgba(179, 38, 30, 0.08)` |
| red-line | `rgba(240, 138, 122, 0.45)` | `rgba(179, 38, 30, 0.4)` |
| text | `#ecebe7` | `#231e16` |
| text-2 | `#a3a39e` | `#5e5446` |
| text-3 | `#8b8b86` | `#675c4d` |
| scrim | `rgba(8, 8, 9, 0.7)` | `rgba(60, 45, 20, 0.35)` |
| shadow-color | `rgba(0, 0, 0, 0.5)` | `rgba(70, 50, 20, 0.18)` |

Tooltip and toast text stay `var(--text)`, so their backgrounds are light in beige.

- [ ] **Step 1: Write the failing tests** in `test/theme.test.ts`:
  - `parseThemePref falls back to system`: `"light"`→`"light"`, `"dark"`→`"dark"`, `"system"`→`"system"`, and `"sepia"`, `42`, `undefined`, `null`, `{}` → `"system"`.
  - `resolveTheme matrix`: `("system", true)`→`"light"`, `("system", false)`→`"dark"`, `("light", false)`→`"light"`, `("dark", true)`→`"dark"`.
  - `readThemePref reads chrome.storage.local` (stub `chrome.storage.local.get` resolving `{ "orion-theme": "light" }` → `"light"`; resolving `{}` → `"system"`; rejecting → `"system"`).
  - `writeThemePref writes storage and the mirror` (stub `chrome.storage.local.set`, `vi.stubGlobal("localStorage", …)`; expect `set` called with `{ "orion-theme": "dark" }` and mirror `setItem("orion-theme", "dark")`; a throwing `localStorage` still resolves).
  - `palettes define the same tokens` (`Object.keys(DARK)` equals `Object.keys(BEIGE)`).
  - `contrast ≥ 4.5 for used pairs, both themes`: for each palette check `text`, `text-2`, `text-3`, `accent-text`, `red` on `bg`, `surface`, `surface-2`; `text` on `tooltip`, `surface-raised`, `surface-hover`; `ok` on `surface`, `surface-2`; `on-accent` on `accent`; `accent-text` on `accent-soft` composited over `surface`. Contrast helper (WCAG relative luminance, alpha compositing over an opaque base) lives in the test file.
- [ ] **Step 2: Run** `npx vitest run test/theme.test.ts` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** `palette.ts` and `theme.ts` with the signatures and values above. If a contrast pair fails, nudge only the BEIGE value (spec allows it) and update the table in the spec in the same commit.
- [ ] **Step 4: Run** `npx vitest run test/theme.test.ts` — expect PASS. Then `npm test && npm run typecheck`.
- [ ] **Step 5: Commit** `feat(orion-waypoint): palette and theme preference with contrast checks`.

---

### Task 2: Panel on tokens, beige theme, Appearance setting

**Files:**
- Create: `src/shared/tokens.css`, `src/shared/themeBoot.ts`
- Modify: `src/sidepanel/index.css` (remove the colour tokens from `:root`, keep `--r-*`, fonts, motion; replace hard-coded colours), `src/sidepanel/index.tsx` (import `../shared/themeBoot` then `../shared/tokens.css` before `./index.css`), `src/sidepanel/index.html` (`<meta name="color-scheme" content="light dark">`), `src/sidepanel/components/Settings.tsx` (Appearance card), `dev/main.tsx` (same imports as the panel)
- Test: `test/tokens.test.ts`

**Interfaces:**
- Consumes: `DARK`, `BEIGE`, `TokenName` (Task 1); `parseThemePref`, `applyTheme`, `readThemePref`, `writeThemePref`, `THEME_KEY` (Task 1).
- Produces: `tokens.css` defining every `--<TokenName>` in three blocks: `:root { color-scheme: dark; …DARK }`, `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { color-scheme: light; …BEIGE } }`, `:root[data-theme="light"] { color-scheme: light; …BEIGE }`. `themeBoot.ts` (side-effect module): synchronously `applyTheme(parseThemePref(localStorage mirror))` in try/catch, then reconciles with `readThemePref()` and subscribes to `chrome.storage.onChanged` for `THEME_KEY`.

- [ ] **Step 1: Write the failing tests** in `test/tokens.test.ts` (load CSS with `import.meta.glob(..., { query: "?raw" })` like `test/brand.test.ts`):
  - `tokens.css matches the palette`: parse the three blocks; the dark block equals `DARK`, both light blocks equal `BEIGE` (whitespace-normalised).
  - `no colour literals outside tokens.css`: in every `src/**/*.css` except `src/shared/tokens.css`, no match for `/#[0-9a-fA-F]{3,8}\b|rgba?\(/`.
  - `accent is only a fill or border`: in `src/sidepanel/index.css`, no `color: var(--accent)` (text uses `--accent-text`); `accent-color` and `border-color` are allowed.
- [ ] **Step 2: Run** `npx vitest run test/tokens.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Write `tokens.css` from the palette. In `index.css`: `color: var(--accent)` → `var(--accent-text)` at the `.btn-on`, `.now-label`, `.now-over`, `.flag`, `.badge-now`, `.bridge-warn` rules; `#4a4e55` → `var(--line-hover)`; `rgba(240,138,122,.45)` and `.55` → `var(--red-line)`; `rgba(240,138,122,.1)` → `var(--red-soft)`; `#232528` → `var(--surface-hover)`; `rgba(8,8,9,.7)` → `var(--scrim)`; both `rgba(0,0,0,.5)` shadows → `var(--shadow-color)` (keep geometry); `#222427` → `var(--surface-raised)`; `#26282c` (tooltip) → `var(--tooltip)`. Remove `color-scheme: dark` from `index.css` (tokens own it). Settings: new first card **Appearance** with three radio buttons "System", "Light", "Dark" bound to `readThemePref`/`writeThemePref` + `applyTheme`.
- [ ] **Step 4: Run** `npx vitest run test/tokens.test.ts` — PASS; then `npm test && npm run typecheck && npm run build`.
- [ ] **Step 5: Visual check** in the harness (`npm run harness`, open `http://localhost:5199/?reset&seed`): screenshot dark and beige (emulate `prefers-color-scheme: light`), then Settings → Light while system is dark. No unreadable text; tooltip, toast, dialog overlay and danger buttons look right in both.
- [ ] **Step 6: Commit** `feat(orion-waypoint): beige light theme for the panel with System/Light/Dark setting`.

---

### Task 3: Capture box on the palette

**Files:**
- Create: `src/content/captureConfig.ts`
- Modify: `src/content/capture.ts` (use `parseCaptureConfig` and `captureStyles`; delete `readConfig` and the hard-coded `STYLES`), `src/background/capture.ts` (pass the theme)
- Test: `test/captureConfig.test.ts`

**Interfaces:**
- Consumes: `DARK`, `BEIGE`, `cssVars` (Task 1); `ThemePref`, `parseThemePref`, `readThemePref` (Task 1).
- Produces: `interface CaptureConfig { mode: "save" | "inbox"; label: string; theme: ThemePref }`; `parseCaptureConfig(raw: unknown): CaptureConfig | null` (existing rules for mode/label; `theme` via `parseThemePref`); `captureStyles(theme: ThemePref): string`. For `"system"`: `:host` gets DARK vars plus `@media (prefers-color-scheme: light) { :host { …BEIGE } }`; for `"light"`/`"dark"`: only that palette. All rules below use `var(--…)`: box `--surface`, text `--text`, border `--line-strong`, label `--accent-text`, input bg `--surface-2`, input border `--line`, focus border `--accent` with ring `--accent-soft`, hint `--text-3`, ok `--ok`, error `--red`, backdrop `--scrim`, shadow `--shadow-color`.

- [ ] **Step 1: Write the failing tests** in `test/captureConfig.test.ts`:
  - `parseCaptureConfig keeps today's rules`: bad mode → `null`; label sliced to 120; missing theme → `"system"`; `theme: "light"` kept; `theme: "neon"` → `"system"`.
  - `captureStyles uses only variables`: for each of the three prefs, after removing the `:host` variable declarations, no `/#[0-9a-fA-F]{3,8}\b|rgba?\(/` remains.
  - `system follows the page`: `captureStyles("system")` contains `prefers-color-scheme: light` and `BEIGE.surface`; `captureStyles("dark")` contains `DARK.surface` and not `BEIGE.surface`.
  - In `test/captureRouter.test.ts` (or a new case beside it): opening the save box passes `theme` from `chrome.storage.local` into the first `executeScript` `args`. Stub `chrome.storage.local.get` → `{ "orion-theme": "light" }`; expect args `["save", <label>, "light"]`.
- [ ] **Step 2: Run** `npx vitest run test/captureConfig.test.ts test/captureRouter.test.ts` — FAIL.
- [ ] **Step 3: Implement.** In `background/capture.ts`, `openCaptureBox` reads `readThemePref()` and passes it as a third arg into the existing `__orionCapture` object. `capture.ts` keeps the closed shadow root, constructable stylesheet and `textContent`-only DOM.
- [ ] **Step 4: Run** the two test files — PASS; then `npm test && npm run typecheck && npm run build`.
- [ ] **Step 5: Commit** `feat(orion-waypoint): capture box follows the panel palette and theme`.

---

### Task 4: Open the welcome tab on install

**Files:**
- Create: `src/shared/pages.ts`, `src/background/install.ts`
- Modify: `src/background/index.ts` (the `onInstalled` listener calls `onInstalled`)
- Test: `test/install.test.ts`

**Interfaces:**
- Produces: `pages.ts`: `export const WELCOME_PAGE = "src/welcome/index.html"`. `install.ts`: `onInstalled(details: { reason: string }): Promise<void>` — always `createMenus()` and `ensureLiveTabsAlarm()` (today's behaviour); additionally `chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) })` only when `details.reason === "install"`.

- [ ] **Step 1: Write the failing tests** in `test/install.test.ts` (stub `chrome` like `test/serviceWorker.test.ts`; mock `../src/background/menus` and `../src/background/idle`):
  - `install opens the welcome tab once`: reason `"install"` → `tabs.create` called once with `{ url: "src/welcome/index.html" }` (stub `getURL` as identity).
  - `update, chrome_update and shared_module_update open nothing`: `tabs.create` not called.
  - `menus and alarm are set up for every reason`.
- [ ] **Step 2: Run** `npx vitest run test/install.test.ts` — FAIL.
- [ ] **Step 3: Implement** `install.ts`; in `index.ts` keep the listener registered synchronously at top level: `chrome.runtime.onInstalled.addListener((d) => void onInstalled(d))`.
- [ ] **Step 4: Run** `npx vitest run test/install.test.ts test/serviceWorker.test.ts` — PASS; then `npm test && npm run typecheck`.
- [ ] **Step 5: Commit** `feat(orion-waypoint): open the welcome tab on fresh install only`.

---

### Task 5: Welcome step logic and actions

**Files:**
- Create: `src/welcome/steps.ts`, `src/welcome/actions.ts`, `src/platform/action.ts`, `src/platform/commands.ts`
- Test: `test/welcomeSteps.test.ts`, `test/welcomeActions.test.ts`, `test/platformWelcome.test.ts`

**Interfaces:**
- Consumes: `createWorkflow`, `addTask`, `startWorkflow`, `recordSavePoint` (`src/shared/workflowActions.ts`); `captureTabs` (`src/platform/tabs.ts`); `validateNextStep` (`src/shared/validators.ts`); `findTaskNode` (`src/shared/taskTree.ts`).
- Produces:
  - `steps.ts`:
    ```ts
    export type StepId = "task" | "tabs" | "save" | "pin";
    export type StepStatus = "done" | "current" | "todo";
    export interface RecentTask { workflowId: string; taskId: string; title: string; workflowName: string }
    export interface WelcomeFacts {
      workflows: IWorkflowState[]; meta: IAppMeta;
      tabsGranted: boolean; tabsAnswered: boolean;
      openedAt: number; pinned: boolean | null;
    }
    export interface WelcomeState {
      steps: Record<StepId, StepStatus>;
      taskMode: "create" | "pick" | "done";
      active: { workflow: IWorkflowState; task: ITaskNode } | null;
      recent: RecentTask[];      // only filled in "pick" mode, max 5
      savedSinceOpen: boolean;
    }
    export function computeWelcome(f: WelcomeFacts): WelcomeState;
    ```
    Rules: `task` done iff `meta.activeWorkflowId` + `meta.currentActiveNodeId` resolve to a task. `taskMode`: `"done"` if active; else `"pick"` if any workflow has a task whose status isn't `"COMPLETED"`; else `"create"`. `recent`: non-completed tasks across workflows, sorted by newest `savePoints[0].createdAt` (missing = `-Infinity`), then `startedAt`, newest first, max 5. `tabs` done iff `tabsGranted || tabsAnswered`. `save` done iff active task has a save point with `createdAt >= openedAt`. `pin` done iff `pinned === true`. `current` = first step in order task → tabs → save → pin that isn't done, except `save` is never `current` while `task` isn't done (it stays `todo`).
  - `actions.ts`:
    - `startFromWelcome(title: string): Promise<{ workflowId: string; taskId: string }>` — `createWorkflow(title, 5)`, `addTask(wf.id, null, title)`, `startWorkflow`.
    - `pickUpTask(workflowId: string, taskId: string): Promise<void>` — `startWorkflow`.
    - `saveFromWelcome(workflowId: string, taskId: string, taskTitle: string, nextStep: string): Promise<void>` — `captureTabs(taskTitle)` then one `recordSavePoint` with `trigger: "manual"`, the tabs, and `nextStep` validated (empty → `null`).
    - `attachNextStep(workflowId: string, taskId: string, nextStep: string): Promise<boolean>` — if `validateNextStep` gives a non-empty value, `recordSavePoint(..., { trigger: "manual", nextStep })` and return `true`; empty → no write, `false`.
  - `platform/action.ts`: `readPinned(): Promise<boolean | null>` — `null` if `chrome.action?.getUserSettings` is missing or throws, else `isOnToolbar`. `onPinnedChange(cb: () => void): () => void` — subscribes to `chrome.action.onUserSettingsChanged` when present, else no-op unsubscribe.
  - `platform/commands.ts`: `getShortcut(name: string): Promise<string | null>` — `chrome.commands.getAll()`, the command's `shortcut`, `""`/missing/throw → `null`.

- [ ] **Step 1: Write the failing tests.**
  `test/welcomeSteps.test.ts` (build state with `test/fixtures.ts` helpers):
  - `fresh install: create mode, task current, rest todo`.
  - `save step waits for an active task`: no active task → `steps.save === "todo"` even with tabs answered.
  - `reopened with an active task: step 1 done, no create`: `taskMode === "done"`, `steps.task === "done"`.
  - `pick mode lists recent tasks`: two workflows, no active, six open tasks with different save-point times → `taskMode === "pick"`, `recent.length === 5`, newest first, completed tasks excluded.
  - `tabs done when granted or answered`.
  - `save done only for a save point after openedAt`: an older save point → not done; one at `openedAt` → done, `savedSinceOpen === true`.
  - `pin: true done, false todo, null todo (never blocks)`; with everything else done and `pinned: null`, `current` is `pin`.
  `test/welcomeActions.test.ts` (`import "fake-indexeddb/auto"`, `installChromeAlarmsMock`, stub `chrome.permissions.contains` → `false`):
  - `startFromWelcome creates one active workflow and task`: `listWorkflows()` length 1, names equal the title, `getMeta()` points at them.
  - `startFromWelcome rejects a long title and writes nothing`: 121-char title rejects with `OrionError`; `listWorkflows()` is empty.
  - `pickUpTask makes it active`.
  - `attachNextStep records only non-empty`: `"  "` → `false`, no new save point; `"Tighten the tagline"` → `true`, `latestNextStep(task.savePoints) === "Tighten the tagline"`.
  - `saveFromWelcome records one save point with the next step`.
  `test/platformWelcome.test.ts`:
  - `readPinned`: missing API → `null`; `{ isOnToolbar: true }` → `true`; throw → `null`.
  - `getShortcut`: `[{ name: "save-point", shortcut: "Alt+Shift+S" }]` → `"Alt+Shift+S"`; `shortcut: ""` → `null`; missing command → `null`.
- [ ] **Step 2: Run** `npx vitest run test/welcomeSteps.test.ts test/welcomeActions.test.ts test/platformWelcome.test.ts` — FAIL.
- [ ] **Step 3: Implement** the four modules to the signatures above.
- [ ] **Step 4: Run** the three files — PASS; then `npm test && npm run typecheck`.
- [ ] **Step 5: Commit** `feat(orion-waypoint): welcome step logic and first-run actions`.

---

### Task 6: Welcome page, preview card, open-panel, Settings link, docs

**Files:**
- Create: `src/welcome/index.html`, `src/welcome/index.tsx`, `src/welcome/Welcome.tsx`, `src/welcome/welcome.css`, `dev/welcome.html`, `dev/welcome.tsx`
- Modify: `vite.config.ts` (`build.rollupOptions.input.welcome = "src/welcome/index.html"`), `src/sidepanel/components/ResumeCard.tsx` (`preview?: boolean`), `src/shared/messages.ts` (`{ type: "ORION_OPEN_PANEL_WINDOW" }`), `src/background/index.ts` (handle it), `src/sidepanel/components/Settings.tsx` ("Show welcome again"), `src/sidepanel/components/Settings.tsx` → extract backup-file import into `src/sidepanel/lib/backup.ts`, `dev/chromeShim.ts` (stubs for `commands.getAll`, `action.getUserSettings`, `sidePanel.open`, `storage.local`, `permissions.request`), `docs/IMPLEMENTATION_PLAN.md`, `README.md`
- Test: `test/messages.test.ts` (new cases), `test/backup.test.ts`

**Interfaces:**
- Consumes: everything from Task 5; `useOrion`, `useNow` (`src/sidepanel/hooks/useOrion.ts`); `ResumeCard`; `Toast`; `hasTabsPermission`, `requestTabsPermission` (`src/platform/tabs.ts`); `WELCOME_PAGE` (Task 4); `themeBoot`, `tokens.css` (Task 2); `openPanelWindow` (`src/background/surface.ts`).
- Produces:
  - `ResumeCard` prop `preview?: boolean`: when true, renders no Mark done / Pause / next-step editor / Copy brief / Reopen tabs controls and always shows the latest save point's time ("Saved just now" via `formatAgo`), ignoring `shouldShowResume`. With `preview` absent the panel renders exactly as before.
  - `ExtensionMessage` gains `{ type: "ORION_OPEN_PANEL_WINDOW" }` (exact keys only). Background accepts it only if `isOwnSender` and `sender.url` starts with `chrome.runtime.getURL(WELCOME_PAGE)`, then `openPanelWindow()`.
  - `backup.ts`: `importBackupFile(file: File): Promise<{ imported: number }>` — rejects files over 5 MB with `OrionError` text "Backup file is larger than 5 MB.", else `importBackup(await file.text())`. Settings and the welcome footer both use it.

Page content and copy are fixed by the spec's "The welcome page" section (headline, four steps, step copy, footer). Layout follows mockup `welcome-v2.html`: two columns ≥ 760px wide, stacked below. Implementation notes the spec pins:
- Facts come from `useOrion()` + `hasTabsPermission()` + `readPinned()` + `getShortcut("save-point")`, re-read on window focus and `onPinnedChange`; `openedAt` is captured once on mount; `tabsAnswered` is component state set by "Not now" or a resolved request.
- Step 3's draft next step: when `savedSinceOpen` flips to true and the draft is non-empty, call `attachNextStep` once (guard with a ref).
- "Open the panel": the window id is fetched on mount (`chrome.windows.getCurrent`) so the click handler calls `chrome.sidePanel.open({ windowId })` with no `await` before it; if `sidePanel.open` is missing or throws, send `ORION_OPEN_PANEL_WINDOW`.
- A visually hidden `aria-live="polite"` region announces "Step N done." when a step completes.

- [ ] **Step 1: Write the failing tests.**
  - `test/messages.test.ts`: `ORION_OPEN_PANEL_WINDOW parses`; `extra keys are rejected`.
  - `test/backup.test.ts` (`fake-indexeddb`): `importBackupFile rejects > 5 MB` (a `File` of 5 MB + 1 byte) with the exact message; `imports a valid export` (round-trip `exportBackup()` → `importBackupFile(new File([json], "b.json"))` → `{ imported: 1 }`).
- [ ] **Step 2: Run** `npx vitest run test/messages.test.ts test/backup.test.ts` — FAIL.
- [ ] **Step 3: Implement** messages, background handler, `backup.ts` (Settings switched to it), `ResumeCard` `preview`, the welcome page, the Settings link (`chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) })`), the Vite input and the harness page (`dev/welcome.tsx` imports `./chromeShim`, theme boot, tokens, then renders `Welcome`).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, and `dist/src/welcome/index.html` exists (`ls dist/src/welcome/index.html`).
- [ ] **Step 5: Visual check** in the harness (`npm run harness`, open `http://localhost:5199/welcome.html?reset`): walk all four steps by keyboard only; card fills after "Save without the shortcut" with the typed next step; screenshots in dark and beige and at 600px wide; panel (`/?seed`) still shows the full resume card with its controls.
- [ ] **Step 6: Docs.** `docs/IMPLEMENTATION_PLAN.md`: add a `0.3 (first run)` status row; fix the stale "Next" list (bridge shipped); add real-Chrome checks: welcome opens once on install and not on update; Alt+Shift+S on the welcome page fills the card; pin step ticks; Open the panel in panel mode and in Arc window mode; no theme flash on panel open with Light override under dark system; capture box in beige on a white site. `README.md`: one line on the welcome tab and theme setting.
- [ ] **Step 7: Commit** `feat(orion-waypoint): welcome tab with live preview card`.

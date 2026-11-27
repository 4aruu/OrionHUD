# Orion Waypoint: first run + light theme (launch piece 2)

Status: design, awaiting owner approval. Date: 2026-11-27.
Mockups (local, not committed): `.superpowers/brainstorm/818-1795786222/content/` — `welcome-v2.html`, `light-theme-v2.html`.

## Launch plan this piece belongs to

| # | Piece | Status |
|---|---|---|
| 1 | Brand: name, icon, tagline | Done, merged (PR #2) |
| 2 | **First run (welcome tab, shortcut teaching) + light theme** | this doc |
| 3 | Landing page (demo GIF, LinkedIn preview card) | later |
| 4 | Chrome Web Store listing, then the LinkedIn post | later; owner opens the developer account |

## Why

Orion Waypoint is launching publicly via the Chrome Web Store and a LinkedIn post. The audience is
developers first: people who lose their place after a detour. They arrive cold, from a post, and
decide in the first minute whether this is worth keeping.

Today that first minute is empty. A store install opens nothing (`onInstalled` only creates menus and
an alarm). The user has to find the icon behind the puzzle piece, then sees a three-bullet empty
state. Tab memory, which the store description promises ("Saves your tabs, AI chats and next step"),
is off until they find it in Settings. And the panel is dark-only, so light-mode users get a
mismatched sidebar.

Success: a new user, within about a minute of installing, has (1) named what they're working on,
(2) decided on tab memory, (3) made one real save point and seen the card it produces, and (4)
pinned the icon — and the panel, welcome page and capture box look right in both light and dark.

## Goals

- A welcome tab that opens once on fresh install and walks through four steps, ending with a real
  save point of the user's own work.
- Ask for tab memory during first run, in plain words.
- A warm beige light theme for the panel, welcome page and capture box, following the system setting
  with a manual override.
- Bring the capture box onto the panel's colours (it still uses the pre-v0.3 indigo/navy).

## Non-goals

- No change to the local-first promise: no accounts, no network requests, no analytics, no
  "did they finish onboarding" telemetry.
- No redesign of the dark theme ("Ledger": graphite + amber). It stays as is.
- No "what's new" page on update.
- No sample/demo data.
- Landing page, store art and store listing (pieces 3 and 4).

## Anti-goals (failure even if it works)

- A welcome page that saves fake data or leaves demo content the user has to delete.
- A theme flash (dark then beige, or the reverse) when the panel or welcome page opens.
- A first run that blocks: every step must be skippable, and skipping must leave a working product.
- Text that fails WCAG AA (4.5:1) in either theme.

## Decisions made with the owner

1. **Welcome page layout: "steps + live preview" (mockup C).** Steps on the left; on the right, the
   real resume card for the task they just named, which fills in when they make a save point.
2. **Step 1 asks "What are you working on right now?"** Their answer creates their first workflow
   and makes it the active task, so the save point in step 3 is real. Rejected: an auto-created
   sample workflow (leaves demo data), and a demo-only card (fake save point, empty panel after).
3. **Light theme: "Beige"** — clearly warm, like sepia paper; amber accent unchanged. Rejected:
   "Paper" (too close to off-white), "Sand" (amber blends in), "Clean" white (generic).
4. **Build approach A: a separate welcome page entry** that reuses the panel's components and
   stylesheet (see Approaches).

## Approaches considered

**Welcome page — picked A.**
- **A. Separate page entry (`src/welcome/`) reusing panel components and the shared colour
  stylesheet.** The preview is literally the panel's `ResumeCard`. Cost: one new build entry and a
  small page layout. Panel behaviour unchanged (one added `preview` prop, see below).
- B. The side panel page opened in a full tab with a `?welcome` flag. No new entry, but the panel
  layout is built for a 360px sidebar and its app shell gains a special case on every load.
- C. Plain static HTML + vanilla TS. Lightest, but the card would be a hand-made copy that drifts from
  the real one, which defeats the point of the live preview.

**Theme mechanism — one sensible way.** CSS custom properties in a shared stylesheet; dark by
default, beige under `prefers-color-scheme: light`, and a `data-theme` attribute on `<html>` for the
manual override. Preference stored in `chrome.storage.local` because the service worker (which
injects the capture box) can read it and page `localStorage` it cannot. Rejected: storing it in
IndexedDB `meta` — the page would have to open the database before first paint.

## The welcome page

Opens with `chrome.tabs.create` when `chrome.runtime.onInstalled` fires with `reason === "install"`.
Never on `update` or `chrome_update`. Reachable again from Settings → "Show welcome again".

Title "Welcome to Orion Waypoint". Left column: icon + wordmark, the tagline as the heading
("Got pulled away? Pick up exactly where you left off."), the line "Four quick steps. Everything
stays on this computer.", then four steps. Each step shows a number, turns into a green tick when
done, and the current step is marked in amber. Right column: "This is what you'll come back to" above
the real resume card.

1. **What are you working on right now?** One text field (placeholder "e.g. Fix the login bug") and
   a Start button. Creates a workflow named with their answer, with one task of the same title, and
   starts it (`createWorkflow` → `addTask` → `startWorkflow`). Validation and limits are the existing
   ones (`validateWorkflowName`, task title validation). Once done, the step shows their answer.
   If a workflow already exists (they reopened the page, or imported a backup), this step shows as
   done with the active task's title, or offers to pick up their active task; it never creates a
   second workflow silently.
   *(My call)* If workflows exist but no task is active — the normal state right after "Import a
   backup" (import resets ACTIVE tasks to PENDING) or after pausing — step 1 becomes "Pick up where
   you were": up to five most recent tasks (by latest save point, then creation), each one click to
   start (`startWorkflow`), plus "or start something new" with the usual field. Step 3 needs an
   active task, so it stays waiting until step 1 is done.
2. **Remember my tabs.** Copy: "Save points keep the tabs and AI chats you had open. Chrome will ask
   once. Nothing leaves your computer." Buttons "Turn on tab memory" (`requestTabsPermission`) and
   "Not now". If declined, the step reads "Off. Save points will keep just your next step. You can
   turn it on in Settings." and counts as done. Reflects the real permission state on load and on
   focus (the user may grant/revoke elsewhere).
3. **Save your place.** An **optional** field first: "What's the very next thing you'll do?"
   (placeholder "e.g. Tighten the tagline"). Then "Press Alt+Shift+S and watch the card fill in." A
   dashed amber "Listening for the shortcut…" box. If the field has text when the save point lands,
   the page records it the way the panel already saves an edited next step (a follow-up manual
   `recordSavePoint` with `nextStep`, read back by `latestNextStep`), so the card shows "Next: …".
   "Save without the shortcut" passes the field straight into its one save point. Empty is fine:
   the save still counts and the card shows the time (and tabs, if tab memory is on). Decided with
   the owner: ask for a next step, but never require it. Pressing the command on this page already works through the existing fallback
   in `openCaptureBox` (extension pages can't be scripted, so it records a save point without a next
   step and broadcasts). The page reloads via `ORION_STATE_CHANGED` and the card fills in. The step
   is done when the active task has at least one save point newer than page load.
   - The key shown is the real binding from `chrome.commands.getAll()`. If it's unassigned (another
     extension took it), the step says so and links "Set a shortcut" to the browser's shortcut page
     (same helper Settings uses).
   - "Save without the shortcut" records the same save point from the page directly.
4. **Pin it to your toolbar.** "Click the puzzle piece, then the pin next to Orion Waypoint." Ticks
   itself using `chrome.action.getUserSettings().isOnToolbar`, re-checked on focus and on
   `chrome.action.onUserSettingsChanged` where available. Browsers without the API show the hint
   only, with no tick and no blocking.

Below the steps: primary button **Open the panel** (always enabled; steps are optional). In panel
mode it calls `chrome.sidePanel.open({ windowId })` from the click (a user gesture, available from
Chrome 116, our minimum). In window mode (Arc, or when the side panel is unavailable) it opens the
panel window, as the toolbar click does. Footer: "Used the unpacked version before? Import a backup"
which opens the panel's Settings → Backup, or offers the same import inline.

Right column card: the panel's `ResumeCard` for the active task, fed by the same data as the panel
(`useOrion`). Before step 1 it shows a neutral placeholder ("No save point yet" with grey lines).

*(My call)* On the welcome page the card is **display-only**: a `preview` prop on `ResumeCard`
hides the controls that change data (Mark done, Pause, next-step editing, Copy brief, Reopen tabs),
so a click in the preview can't complete the task created in step 1. In preview mode the card
always shows the latest save point's time ("Saved just now"), bypassing the 5-minute
`shouldShowResume` rule that applies in the panel. The panel's own behaviour is unchanged; this is
the one deliberate change to panel code under approach A.

## Light theme ("Beige")

Tokens (light). Dark tokens are unchanged from `src/sidepanel/index.css`.

| Token | Dark (today) | Beige |
|---|---|---|
| `--bg` | `#121315` | `#f1ebdf` |
| `--surface` | `#18191c` | `#f7f2e8` |
| `--surface-2` | `#1e2023` | `#e9e1d2` |
| `--line` | `#26282c` | `#ddd3c1` |
| `--line-strong` | `#383b41` | `#c9bca5` |
| `--accent` (fills, borders) | `#e8a33d` | `#e8a33d` |
| `--accent-text` (new: amber used as text) | `#e8a33d` | `#8f5100` |
| `--on-accent` | `#1a1408` | `#1a1408` |
| `--accent-soft` | `rgba(232,163,61,.09)` | `rgba(232,163,61,.16)` |
| `--ok` | `#8fbf96` | `#356a3e` |
| `--hover` | `rgba(255,255,255,.04)` | `rgba(60,45,20,.05)` |
| `--accent-hover` | `#f0b155` | `#db9530` |
| `--accent-line` | `rgba(232,163,61,.5)` | `rgba(143,81,0,.45)` |
| `--text` | `#ecebe7` | `#231e16` |
| `--text-2` | `#a3a39e` | `#5e5446` |
| `--text-3` | `#8b8b86` | `#675c4d` |

`--accent-text` is new: on beige, bright amber text fails contrast, so amber used as text (the "Now"
label, the current task row, capture box label) switches to a darker amber. Every existing use of
`--accent` as a text colour moves to `--accent-text`. The ~10 hard-coded colours outside `:root` in
`index.css` (reds, overlays, shadows, one grey) become tokens with light values. `--red` gets a light
value that passes 4.5:1 on beige.

Switching: follows the system by default. Settings gets **Theme: System / Light / Dark**. The panel,
welcome page and capture box all honour it. `<meta name="color-scheme">` becomes `light dark` (or is
set to match the override) so scrollbars and form controls follow.

No flash: the resolved theme must be on `<html>` before first paint. With the System setting, pure
CSS media queries handle it with no script. For a manual override, the builder picks the mechanism
(e.g. a tiny synchronous module that reads a mirrored copy, or rendering after the storage read);
the requirement is no visible flash.

**Capture box.** Its hard-coded indigo/navy styles in `src/content/capture.ts` become the same
tokens (dark and beige), using `prefers-color-scheme` inside its shadow root. When the override is
Light or Dark, the service worker passes the resolved theme in the existing `__orionCapture` config,
next to `mode` and `label`. It stays a closed shadow root with a constructable stylesheet; no
network, no `innerHTML`.

Brand note: the brand spec (piece 1) said the panel accent is indigo with gold for "you are here".
The v0.3 "Ledger" redesign replaced that with amber, and this piece confirms amber for the panel,
welcome page and capture box. Indigo, violet and the night background remain for the icon, store
art and landing page.

## Settings changes

- New **Appearance** card: Theme System / Light / Dark.
- **Show welcome again** link (opens the welcome tab).
- Tab memory card unchanged.

## Extension and Web Store requirements

The owner's rule for this piece: follow what a well-behaved extension is expected to do.

- **Welcome tab only on install.** Open it for `reason === "install"` only; never on update, browser
  update or startup. No other tabs opened unprompted.
- **Explain before asking.** The tab-memory step says what is saved and that it stays on the device
  before the button that triggers Chrome's prompt.
- **Ask only from a click.** `chrome.permissions.request` and `chrome.sidePanel.open` are called only
  inside click handlers (both require a user gesture).
- **No means no.** If tab memory is declined, everything still works with next-step-only save points;
  the welcome page never re-prompts on its own. The manual path is Settings → Tab memory.
- **Everything optional.** Every step can be skipped; "Open the panel" is always enabled; closing the
  tab mid-way leaves a working product.
- **No new permissions.** `tabs` stays in `optional_permissions`; nothing added to `permissions` or
  `host_permissions`, so the install prompt and review scope don't grow.
- **No remote code or data.** All welcome-page code bundled; no fetches, fonts, images or analytics
  from the network. PRIVACY.md stays accurate (mention the theme preference stored locally).
- **Single purpose.** The welcome page only teaches the core flow (name your work, save your place,
  come back); no upsells, ratings prompts or unrelated features.
- **Accessible.** Keyboard-only completion of all steps, visible focus, live-region announcement when
  a step completes, WCAG AA contrast in both themes, reduced motion respected.

## Constraints

- Manifest V3, `minimum_chrome_version` 116; must keep working on the browsers in the README table
  (Chrome, Edge, Brave, Opera, Arc in window mode, Vivaldi). Feature-detect `sidePanel`,
  `action.getUserSettings`, `action.onUserSettingsChanged`.
- CSP `script-src 'self'`: no inline scripts on the welcome page.
- No new permissions. `tabs` stays optional.
- No network requests from any page; system fonts only.
- Respect reduced motion (existing motion tokens).
- Existing tests, `npm run build`, `npm run typecheck`, `icons:check` keep passing.

## Testing

- Unit: first-run step state (given workflows/meta/permission/commands/pin state → which steps are
  done), the theme resolver (System/Light/Dark × system preference), the `onInstalled` handler opens
  the welcome tab only on `install`.
- Contrast: a test that checks every text-on-background token pair *actually used* in the CSS is
  ≥ 4.5:1 in both themes (the test lists the pairs). *(My call)* Beige values may be nudged to pass,
  as long as the look stays "Beige"; the table above is the starting point.
- Source scan (like `brand.test.ts`): no hard-coded colours outside the token blocks in the panel
  CSS and the capture box.
- Dev harness: the welcome page viewable in `npm run harness`, in both themes, for QA.
- Real-Chrome checks added to `docs/IMPLEMENTATION_PLAN.md`: welcome tab opens once on install and
  not on update; Alt+Shift+S on the welcome page fills the card; pin tick; Open the panel in panel
  and window mode; no theme flash; capture box in light on a white site.

## Left to the builder

- File layout of the welcome entry and how crxjs picks it up (e.g. `build.rollupOptions.input`).
- Exact no-flash mechanism for the manual override.
- Whether the shared token stylesheet is a new file imported by both pages or stays in `index.css`.
- Wording polish within the copy given here.

# Orion Waypoint: works on all Chromium browsers

Date: 2026-11-24 · Launch piece 1b (between the brand and the store listing) · Status: awaiting approval

## Intent

The owner wants Orion Waypoint to work on every browser that Zen Reader lists: Chrome, Edge, Opera, Brave and Arc, plus Vivaldi. All of them install from the Chrome Web Store. Firefox and Safari are out of scope for the launch. Firefox is a later, separate build.

## Root cause

The whole UI is a side panel (`chrome.sidePanel`). Arc has no side-panel API, and Vivaldi supports it only in part. Worse, `src/background/index.ts` calls `chrome.sidePanel.setPanelBehavior(...)` and `chrome.idle.setDetectionInterval(...)` at the top level of the service worker. If either API is missing, the worker throws on load, and every feature dies: shortcuts, context menu, alarms and auto save points, not only the panel. Tab groups are already guarded (`restoreTabs` try/catch, `chrome.tabGroups &&` on capture).

## Approaches

- **A. Runtime feature detection plus a window fallback (picked).** One build. Use the side panel when it exists. Otherwise the toolbar button opens the same panel page in a small standalone window. A keyboard shortcut opens that window anywhere.
- B. A separate build per browser. More listings and more CI, for no gain. Every one of these browsers installs from the Chrome Web Store.
- C. Fall back to an action popup. Rejected because popups close when focus leaves, which is useless for a panel you work beside.

## Design

**`src/background/surface.ts` (new)** decides and opens the UI surface:

- `initSurface(): Promise<"panel" | "window">`
  - If `chrome.sidePanel?.setPanelBehavior` exists and resolves, the mode is "panel".
  - Otherwise, including when the call rejects, the mode is "window".
- `openPanelWindow(): Promise<void>` opens `src/sidepanel/index.html` as a `popup`-type window, 420×720, on the focused window's right edge when its bounds are known.
  - It keeps one instance: the window id is stored in `chrome.storage.session`. If that window still exists (`chrome.windows.get`), it is focused instead of creating another.
  - No `tabs` permission is needed.
- `chrome.action.onClicked` always calls `openPanelWindow()`. Chrome doesn't fire `onClicked` while `openPanelOnActionClick` is on, so in panel mode the click still opens the side panel. In window mode the click opens the window.
- **New manifest command `open-window`** (suggested `Alt+Shift+O`, description "Open Orion Waypoint in its own window") calls `openPanelWindow()` in every browser. It's the escape hatch where the side panel exists but misbehaves (Vivaldi). No new permissions.

**Guard optional APIs in the service worker.** `chrome.idle` setup and the side-panel call only run when the API exists. Auto save points on idle are then simply unavailable rather than breaking everything else. Notifications are already guarded.

**Docs:**
- README gets a "Supported browsers" table: Chrome, Edge, Brave and Opera use the side panel; Arc uses the window; Vivaldi uses the side panel or the window; Firefox and Safari are not yet supported. It also documents the new shortcut.
- The Settings "Shortcuts" card lists `Alt+Shift+O`.
- `docs/IMPLEMENTATION_PLAN.md` gets a per-browser manual check list.

## Troubleshooting pass (holes found in this design, and their fixes)

1. **Click could open both the panel and a window.** Chrome is not documented to suppress `action.onClicked` while `openPanelOnActionClick` is on. Fix: register `onClicked` synchronously at the top level, as MV3 requires so the click can wake the worker. The handler reads the stored mode (`chrome.storage.session` key `surfaceMode`, written by `initSurface`) and does nothing in "panel" mode.
2. **"Reopen tabs" would target the Orion window.** `restoreTabs` calls `chrome.tabs.create` without a `windowId`, so in window mode the "current window" is the Orion popup. Fix: resolve `chrome.windows.getLastFocused({ windowTypes: ["normal"] })` and pass its `windowId` to `tabs.create`. If there's no normal window, create one. Test: tabs open in the normal window and are grouped there.
3. **The time's-up drift check would read the Orion window.** `timesUp.ts` queries `{ active: true, lastFocusedWindow: true }`, and in window mode that can be the Orion popup itself, which falsely reads as "drifted". Fix: query the active tab of the last focused **normal** window. Test included.
4. **Copy says "side panel" and "Chrome".** It's wrong in window mode and in Edge, Brave, Opera and Arc. Fix: neutral wording.
   - "Start a workflow in Orion Waypoint first."
   - "Pick one in Orion Waypoint."
   - "Add a next step in Orion Waypoint."
   - "You can pick this up in Orion Waypoint."
   - "Your browser doesn't allow extensions on this page. Open Orion Waypoint instead."
   - "give it more time in Orion Waypoint."

   Extend the old-name scan test to also forbid user-facing "side panel" and "Chrome doesn't" strings in `src` (comments excepted).
5. **Vivaldi can fail silently.** `setPanelBehavior` may resolve but no panel shows, and a keyboard shortcut alone isn't discoverable. Fix: add an action context-menu item (right-click the toolbar icon) labelled "Open in its own window", using `contexts: ["action"]` with no new permission. It's created alongside the existing menus and works in every browser.

What only real browsers can answer (recorded for the owner's manual check):
- whether Arc renders `type: "popup"` windows normally
- whether Vivaldi's panel opens from the toolbar
- whether Opera routes the side panel into its own sidebar

## Edge cases

- The user closes the window: the stored id is stale, so `windows.get` rejects and a new window opens.
- `chrome.storage.session` is unavailable: just open a new window each time (Chromium 102+ all have it).
- The panel page runs in a normal window: it already works in a tab (the dev harness proves it), and its narrow layout fits 420px.
- The panel window gets resized: nothing to handle, the layout is fluid.

## Non-goals

- Firefox (`sidebar_action`) and Safari builds.
- An Edge Add-ons listing (piece 4).
- Arc-specific UI.

## Verification

- **Unit tests (`test/surface.test.ts`, chrome stubs):**
  - sidePanel present: `setPanelBehavior` called, mode is "panel"
  - sidePanel absent: mode is "window"
  - setPanelBehavior rejects: mode is "window"
  - `openPanelWindow` creates a window, then focuses the same window on the second call
  - stale id: creates a new one
- **Unit test that the service worker doesn't throw** when `chrome.sidePanel` and `chrome.idle` are undefined. Import `src/background/index.ts` under a stubbed `chrome` global whose event objects have no-op `addListener`. No refactor is needed.
- **Unit tests for holes 2–4:**
  - `restoreTabs` targets the normal window
  - the drift check ignores the Orion window
  - the copy scan finds no "side panel" or "Chrome doesn't"
- `npm run typecheck`, `npm test` (with the icon check) and `npm run build`. `dist/manifest.json` has the `open-window` command and no new permissions.
- The owner checks it in the real browsers they have, using the README table.

## Execution (owner asked to stay lean at ~79% usage)

- Stacked on the brand branch as its own PR: branch `claude/orion-waypoint-browsers` from `8b23a3f`, PR base `claude/zen-reader-link-436e35`, retargeted to `main` after #2 merges.
- Built inline with test-first steps, followed by one final review.

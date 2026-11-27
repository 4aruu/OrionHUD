# Orion Waypoint implementation status

| Version | What | Verified by |
|---|---|---|
| 0.1 | IndexedDB storage, alarms, distraction guard, basic side panel | original tests |
| 0.2 | Save points, resume card, keyboard outliner, milestones, decisions, inbox, handoff brief, AI-aware tab memory, crash recovery, backup; atomic cross-context storage; security hardening | `npm test` (11+ files), `npm run build`, dev-harness QA in a real browser; README manual checklist for in-Chrome checks |
| 0.2 (brand) | Renamed to Orion Waypoint; frosted Way Back icon set with render/check pipeline; manifest identity, README, PRIVACY | `npm test` (incl. icon check), `npm run build`, dev-harness check |
| 0.3 (first run) | Welcome tab on fresh install (four skippable steps beside a live preview of the resume card, Open the panel, backup import); beige light theme with Settings → Appearance (System / Light / Dark) for the panel, welcome tab and capture box; Settings → Show welcome again | `npm test` (incl. tokens, palette contrast, welcome steps/actions, install), `npm run typecheck`, `npm run build`, dev-harness walk-through (`/welcome.html?reset`) by keyboard in both themes and at 600px |

Design: `docs/superpowers/specs/2026-11-23-save-points-design.md`
Plan: `docs/superpowers/plans/2026-11-23-save-points.md`
Brand design: `docs/superpowers/specs/2026-11-24-orion-waypoint-brand-design.md`
Brand plan: `docs/superpowers/plans/2026-11-24-orion-waypoint-brand.md`
First-run design: `docs/superpowers/specs/2026-11-27-orion-waypoint-first-run-design.md`
First-run plan: `docs/superpowers/plans/2026-11-27-orion-waypoint-first-run.md`
Research: `docs/research/2026-11-23-competitive-landscape.md`

## Not yet verified in real Chrome

These depend on Chrome itself and can't run in Node or the dev harness; see the README QA checklist:

- `Alt+Shift+S` / `Alt+Shift+Q` capture box injection and its fallback on `chrome://` pages.
- `chrome.idle` auto save points, startup recovery, and the ↩ badge.
- Context menu Orion Waypoint › "Pin as a decision" saves the selection under Decisions.
- Tab-group restore.
- Frosted icon in dark and light toolbars and on `chrome://extensions`.
- Toolbar hover title "Orion Waypoint".
- Right-click shows the "Orion Waypoint" submenu with "Pin as a decision" / "Send to inbox".
- Capture box in a narrow window (brand on one line).
- Notification shows the full-size icon.
- An exported backup is named `orion-waypoint-backup-YYYY-MM-DD.json`, and a v0.2 backup imports.
- Per browser (see README "Supported browsers"): install from `dist/`, then check the toolbar click, `Alt+Shift+O`, and right-click icon → Open in its own window.
  - Chrome, Edge, Brave, Opera: the click opens the side panel, and not also a window.
  - Arc: the click opens one window at the right edge; Reopen tabs lands in the browser window, not the Orion window.
  - Vivaldi: note whether the side panel opens; the window must always work.
  - Every browser: Settings → Change shortcuts opens that browser's shortcut page; the tab-memory prompt wording matches what the browser shows.
  - Window mode: a time's-up notification does not claim you drifted just because the Orion window had focus.
- First run (0.3):
  - A fresh install opens the welcome tab once; reloading or updating the extension (and a browser update) does not.
  - On the welcome tab, `Alt+Shift+S` records a save point and the preview card fills in; a typed next step shows on the card as the next step.
  - The pin step ticks itself when you pin the icon (and un-ticks when you unpin), where the browser reports pin state.
  - Open the panel opens the side panel in panel mode, and the panel window in Arc (window mode).
  - No theme flash when opening the panel with Settings → Appearance → Light while the system is dark (and Dark under a light system).
  - The capture box is beige on a white site under the Light theme (or a light system theme).

## Before the Web Store submission

A store install gets a new extension ID, so its storage starts empty. Existing unpacked users must
Export a backup (Settings), install from the store, then Import it.

## Next

1. Chrome Web Store submission (privacy policy ready; first-run welcome tab in place). The agent bridge shipped in 0.3.
2. Optional on-device thread summaries (Chrome Summarizer API) behind a capability check.

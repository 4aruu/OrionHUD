# Orion Waypoint implementation status

| Version | What | Verified by |
|---|---|---|
| 0.1 | IndexedDB storage, alarms, distraction guard, basic side panel | original tests |
| 0.2 | Save points, resume card, keyboard outliner, milestones, decisions, inbox, handoff brief, AI-aware tab memory, crash recovery, backup; atomic cross-context storage; security hardening | `npm test` (11+ files), `npm run build`, dev-harness QA in a real browser; README manual checklist for in-Chrome checks |
| 0.2 (brand) | Renamed to Orion Waypoint; frosted Way Back icon set with render/check pipeline; manifest identity, README, PRIVACY | `npm test` (incl. icon check), `npm run build`, dev-harness check |

Design: `docs/superpowers/specs/2026-11-23-save-points-design.md`
Plan: `docs/superpowers/plans/2026-11-23-save-points.md`
Brand design: `docs/superpowers/specs/2026-11-24-orion-waypoint-brand-design.md`
Brand plan: `docs/superpowers/plans/2026-11-24-orion-waypoint-brand.md`
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
  - Window mode: a time's-up notification does not claim you drifted just because the Orion window had focus.

## Before the Web Store submission

A store install gets a new extension ID, so its storage starts empty. Existing unpacked users must
Export a backup (Settings), install from the store, then Import it.

## Next

1. v0.3 agent bridge (MCP via `npx` + native messaging), with `brief.ts` as the contract.
2. Chrome Web Store submission (privacy policy ready).
3. Optional on-device thread summaries (Chrome Summarizer API) behind a capability check.

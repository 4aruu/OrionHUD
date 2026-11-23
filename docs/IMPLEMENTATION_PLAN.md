# OrionHUD implementation status

| Version | What | Verified by |
|---|---|---|
| 0.1 | IndexedDB storage, alarms, distraction guard, basic side panel | original tests |
| 0.2 | Save points, resume card, keyboard outliner, milestones, decisions, inbox, handoff brief, AI-aware tab memory, crash recovery, backup; atomic cross-context storage; security hardening | `npm test` (11+ files), `npm run build`, dev-harness QA in a real browser; README manual checklist for in-Chrome checks |

Design: `docs/superpowers/specs/2026-11-23-save-points-design.md`
Plan: `docs/superpowers/plans/2026-11-23-save-points.md`
Research: `docs/research/2026-11-23-competitive-landscape.md`

## Not yet verified in real Chrome

These depend on Chrome itself and can't run in Node or the dev harness; see the README QA checklist:

- `Alt+Shift+S` / `Alt+Shift+Q` capture box injection and its fallback on `chrome://` pages.
- `chrome.idle` auto save points, startup recovery, and the ↩ badge.
- Context-menu "Pin as decision".
- Tab-group restore.

## Next

1. v0.3 agent bridge (MCP via `npx` + native messaging), with `brief.ts` as the contract.
2. Chrome Web Store submission (privacy policy ready).
3. Optional on-device thread summaries (Chrome Summarizer API) behind a capability check.

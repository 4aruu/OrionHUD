# OrionHUD, Phase 1 and 2

## What's actually verified

- `src/shared/types.ts`, `src/shared/db.ts`: storage layer, per-key
  locking. `npm test` includes a control test that reproduces the exact
  data-loss bug the locking prevents (`test/db.test.ts`, third test).
  Delete the lock in `db.ts` and rerun to see it fail for real, don't
  take this on faith.
- `src/shared/urlMatching.ts`, `src/shared/taskTree.ts`: pure functions,
  no chrome.* calls, fully unit tested (`test/urlMatching.test.ts`,
  `test/taskTree.test.ts`). This is deliberate: the alarm handler that
  uses these is thin plumbing around logic that's actually testable
  without mocking the extension APIs.
- `src/background/timesUp.ts`: the "Time's Up" evaluator (spec 5.1).
  Wired into `background/index.ts`'s `chrome.alarms.onAlarm` listener.
  Not unit tested itself, it's plumbing, but everything it depends on
  (`evaluateDrift`, `findTaskNode`) is.

Not yet loadable into Chrome: there's no build step wired up, so
`src/background/index.js` etc don't exist as compiled output yet.
That's Phase 3, along with `chrome.scripting.executeScript` wiring for
click-to-invoke and the `chrome.permissions.request` flow.

`src/content/index.ts`, `src/sidepanel/*`: still empty stubs.

## Decisions made, and what they cost

**1. Content script injection: click-to-invoke, not auto-inject.**
No static `content_scripts` entry in `manifest.json`. The HUD injects
via `activeTab` + `chrome.scripting.executeScript` on icon click, not
on every page load. Consequence: `activeTab` doesn't follow you to
other tabs and doesn't re-grant on return from idle. Handled per
feature:

- **AFK recovery (spec 6)**: moved to the side panel instead of an
  injected overlay. Side panel needs no host permission and persists
  independent of page content, better fit than the original design.
- **Distraction Guard (spec 5.2)**: needs cross-tab presence that
  `activeTab` can't give. `optional_host_permissions: ["<all_urls>"]`
  is declared, to be requested via `chrome.permissions.request` at
  workflow start (Phase 3). Declined permission means the guard doesn't
  run that session, it doesn't break anything else.

Static `tabs` permission was deliberately left out, it would resolve
`tab.url` for every tab regardless of grants (a Chrome Web Store
sensitive-permission warning) and defeats the reason for choosing
click-to-invoke.

**How Phase 2 actually handles the resulting `tab.url === undefined`
case**: `evaluateDrift()` in `urlMatching.ts` returns a three-state
result, `"on-target" | "drifted" | "unknown"`, not a boolean. Collapsing
"unknown" into "drifted" would fire a distraction warning on every tab
OrionHUD can't see into, regardless of whether the user is actually
off-task, which is worse than saying nothing. `chrome.notifications` is
the baseline alert channel precisely because it needs no host
permission at all and fires reliably whether or not the tab is
readable. The in-page modal from the original spec is sent as a
best-effort addition on top of that, not the only channel.

**2. No encryption on micro-notes.** IndexedDB here is local,
same-origin, not exposed over network. Reasonable for a personal tool.
Void the moment `chrome.storage.sync` or an export feature ships, since
note content would then leave the local machine.

**3. Schema gaps filled in that the original spec didn't cover**:
- `ITaskNode.targetUrl: string | null`. Section 5.1 depends on
  comparing against a task's target URL, but the original spec's
  `ITaskNode` never had a field for one.
- `IWorkflowState.blacklistedDomains: string[]`. Section 5.2 references
  "a blacklisted or non-productive domain structural block" with no
  actual schema behind it. Scoped per-workflow, not global, since
  Slack is a distraction during deep coding and the whole point of an
  on-call workflow.

**4. chrome.alarms minimum granularity.** Packed extensions can't
reliably fire alarms under about 1 minute. `scheduleTaskAlarm()` clamps
`allocatedTimeMs` up to that floor instead of silently creating an
alarm that may never fire. If you need sub-minute countdowns visible in
the UI, that's a client-side display timer layered on top of the alarm,
not the alarm's own precision, the alarm's job is only the eventual
"time's up" event.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## Next (Phase 3)

1. `chrome.scripting.executeScript` wiring for click-to-invoke, plus
   the `chrome.permissions.request` flow for the Distraction Guard,
   started at workflow-start, not on install.
2. Content script HUD in Shadow DOM. Standard flexbox, no matrix-
   positioning ban carried over from the original spec.
3. Distraction Guard's stateful side: `isUrlBlacklisted()` already
   exists and is tested, what's missing is the `chrome.tabs.onActivated`
   listener and grace-period countdown around it, which only makes
   sense to build once the permission flow above exists to feed it real
   tab data.

Don't start the side panel (Phase 4, the AFK recovery UI's actual home)
until the message contract from `background/index.ts`
(`ORION_SHOW_RECOVERY`) has at least one real consumer to verify
against, otherwise it's UI built against a guess.

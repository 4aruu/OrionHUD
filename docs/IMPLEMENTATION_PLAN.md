# OrionHUD Implementation Plan

Status as of writing: Phases 1-2.5 done and tested (23/23 passing, run
`npm install && npm run typecheck && npm test` to confirm). Everything
below is written against what actually exists in this repo, not the
original concept doc, which has already had its flex/grid ban, false
"frozen state" model, missing schema fields, and Firefox claim removed
or corrected across Phases 1-2.

## Done

| Phase | What | Verified by |
|---|---|---|
| 1 | IndexedDB storage, per-key locking | `test/db.test.ts` (includes a control test proving the race is real) |
| 2 | Time's Up evaluator, drift detection, task tree search | `test/urlMatching.test.ts`, `test/taskTree.test.ts` |
| 2.5 | Workflow/task/note orchestration, alarm scheduling | `test/workflowActions.test.ts` |

Everything above is pure logic or storage, testable in Node. Nothing
below this line can be fully verified without loading the extension
into an actual browser, which is the reason it comes after, not before,
everything that could be tested cheaply.

## Phase 3: Build tooling + click-to-invoke

This has to come first in Phase 3, everything else in this phase
depends on there being a real bundle to load.

1. Add `vite` + `@crxjs/vite-plugin`, `vite.config.ts` pointing at
   `manifest.json`. `npm run build` should produce `dist/` with real
   `.js` files matching what `manifest.json` already references.
2. Load `dist/` as an unpacked extension in `chrome://extensions`.
   First manual checkpoint: does it load without errors. If not, stop
   here, don't build UI on top of a manifest that doesn't even load.
3. `chrome.action.onClicked` listener in `background/index.ts`, calling
   `chrome.scripting.executeScript` to inject `src/content/index.ts`
   into the clicked tab. `activeTab` already covers this, no new
   permission needed.
4. Content script: Shadow DOM root, minimal placeholder div, just
   proving injection works. Do not build the pipeline chart yet, that's
   Phase 6.
5. Manual checkpoint: click the icon on a real page, confirm the
   Shadow DOM mounts and doesn't visibly break the host page's styles.

## Phase 4: Distraction Guard, permission flow

`isUrlBlacklisted` already exists and is tested. What's missing is
everything that feeds it real data.

1. `chrome.permissions.request(['<all_urls>'])` called from inside the
   "Start Workflow" click handler (has to stay inside that handler,
   Chrome requires the call to be traceable to a user gesture, it can't
   be deferred to a later async tick or it silently fails).
2. Before writing this, decide what the request dialog actually says to
   the user. `<all_urls>` triggers Chrome's strongest permission
   warning ("Read and change all your data on all websites"). That's
   not a UI copy problem you can soften, it's the actual permission
   being requested. If that's going to make people bail on the
   workflow-start flow, the real fix is scoping the request down (e.g.
   only the domains already in `blacklistedDomains`, requested
   individually) rather than asking for everything up front. Decide
   this before building the handler, not after watching people decline it.
3. `chrome.tabs.onActivated` listener, only registered if the
   permission was granted. Checks `isUrlBlacklisted(tab.url,
   workflow.blacklistedDomains)`.
4. Grace-period state machine: a new pure function (test it the same
   way as `evaluateDrift`) taking `(blacklistedSince: number | null,
   gracePeriodMins: number, now: number) => 'ok' | 'grace' |
   'expired'`. Keep this pure and separate from the `chrome.tabs`
   listener itself, same reasoning as `timesUp.ts`.
5. Manual checkpoint: grant the permission, switch to a blacklisted
   tab, wait out the grace period, confirm something actually fires.

## Phase 5: Side panel (Master Control Deck)

This is where `workflowActions.ts` gets a real caller for the first
time.

1. Workflow creation form calling `createWorkflow` + `addTask`.
2. Task tree view, read-only first, rendered from `getWorkflow`.
3. "Start Workflow" button calling `startWorkflow`, this is also where
   Phase 4's permission request lives.
4. Consumer for the `ORION_SHOW_RECOVERY` message `background/index.ts`
   already sends on idle-to-active transitions. This message contract
   exists now but has zero consumers, don't build more UI against it
   without checking the payload shape still matches what
   `background/index.ts` actually sends.

## Phase 6: Content script HUD, visual polish

Lowest priority, purely cosmetic relative to Phases 3-5. Standard CSS
(flexbox/grid), no matrix-positioning ban carried over from the
original spec, that constraint was removed for good reason (see prior
conversation, not repeated here). SVG pipeline chart, glassmorphic
theme from the original doc's CSS can be reused as-is, the visual
design was never the part that was wrong.

## Not planned

Firefox/`sidebar_action` support: dropped, not deferred. If this
becomes a real requirement later it's a second UI implementation, not
a checkbox, treat it as new scope rather than resurrecting the original
roadmap's claim.

## Sequencing rule for all of the above

Don't start a phase until the previous one's automated tests pass and,
where a manual checkpoint is listed, that checkpoint has actually been
done. The pattern across Phases 1-2.5 was consistently cheaper to catch
a bug in a two-second Node test than in a service worker you have to
kill and restart by hand in `chrome://extensions`. Nothing about Phases
3-6 changes that, they're just the part of the project where not
everything can be pushed into that category.

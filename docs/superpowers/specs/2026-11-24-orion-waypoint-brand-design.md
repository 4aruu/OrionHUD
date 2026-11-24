# Orion Waypoint: brand design

Date: 2026-11-24 · Piece 1 of 4 in the public launch · Status: awaiting approval

## Intent

The owner wants to launch something that is *theirs*, announced on LinkedIn, at the level of
polish of store extensions like Zen Reader. The engine (v0.2) is already strong. What's missing
is the outside: a name strangers can find, an icon that looks finished, and words that say what
it does in one breath.

Who it's for, in the owner's words: "people like myself who forget things a lot after a brief
moment of deviation." Developers are the first audience, because tasks, AI threads and the
handoff brief serve them best, but the headline speaks to the human problem.

## Launch plan this piece belongs to

| # | Piece | Status |
|---|---|---|
| 1 | **Brand**: name, icon, tagline, colors, rename in product | this doc |
| 2 | First run (welcome tab, shortcut teaching) + light theme | later |
| 3 | Landing page (demo GIF, LinkedIn preview card) | later |
| 4 | Chrome Web Store listing, then the LinkedIn post | later; owner opens the developer account ($5) |

## Approaches considered

**Launch shape.** Picked **A**.
- **A. Full launch:** brand, first run, landing page, Web Store listing, then the post. Real "Add to Chrome" button; the Google review takes days to weeks.
- B. Showcase first: landing page + GitHub zip. Fast, but LinkedIn visitors won't load an unpacked extension.
- C. Panel polish + screenshots only. Fastest, weakest.

**Name.** Picked **Orion Waypoint**, after checking every option:

| Name | Clash found | Domains (RDAP, 2026-11-24) |
|---|---|---|
| OrionHUD | Paid "ORION HUD" add-on for FiveM (GTA V) by Orion Studios | .com/.app/.dev all taken |
| Orion Thread | Search noise from Meta Threads and the Thread smart-home standard | .com taken |
| Orion Compass | none | .com taken |
| **Orion Waypoint** | **none on web, Chrome Web Store or GitHub** | **.com and .app unregistered** |

Plain "Orion" is crowded (Kagi's Orion browser, two AI side-panel extensions named "Orion"), so it
always carries the second word. "Waypoint" is what a save point is: a marker you navigate back to.

**Icon direction.** Picked **B, The Way Back**, over A (The Belt: three belt stars) and C (Star
Pin: map pin with a star cut out). B tells the whole story: you wander off, and a trail of dots leads back to your star.

**Finish.** Picked **frosted glass**, over glossy (shine band, glass beads) and flat.

## Decisions

### Name and words

- **Product name:** Orion Waypoint (exact spacing and capitals, always both words in user-facing text).
- **Tagline:** "Got pulled away? Pick up exactly where you left off."
- **One-sentence description** *(my call; used in the manifest, store and landing page, ≤132 chars for the manifest)*:
  "Saves your tabs, AI chats and next step whenever you get pulled away, so you pick up exactly where you left off." (112 chars)

### Icon: The Way Back, frosted glass

A rounded night-sky tile (`#0e1330`) with a blurred nebula glowing through frosted glass
(indigo `#4f46e5` lower left, violet `#9333ea` lower right, gold `#f5a524` behind the star), a
trail of white dots that grow and brighten toward a white-hot star, and a soft light along the top edge.

Each size is drawn separately, not scaled down:

| File | Size | Content |
|---|---|---|
| `icon128.png` | 128 | 96×96 artwork centered with 16px transparent padding, no border (Chrome Web Store rule). Full nebula, 5 dots, blurred star glow, top-edge light. |
| `icon48.png` | 48 | Rendered from the 128 artwork. |
| `icon32.png` | 32 | Own drawing: 2 nebula blobs, 3 dots, star, no blur halo on the star. |
| `icon16.png` | 16 | Own drawing: 1 indigo blob, 2 dots, star, no rim. **Star snapped to the pixel grid before export** (vertical tips centered on a pixel column, horizontal tips on a pixel row). |

Reference art: Appendix A (SVG sources, as approved in the mockups).

### Colors *(my proposal, accepted without changes)*

| Token | Hex | Where |
|---|---|---|
| Night | `#0e1330` | Icon tile, store art, landing page backgrounds |
| Indigo | `#6366f1` | Main accent. Already the panel's `--accent`, so the panel doesn't change in this piece. |
| Gold | `#ffd479` | Only for "you are here" moments (resume card, active task). Applied in piece 2, not here. |
| Violet | `#9333ea` | Only in the nebula glow on the icon, store art and landing page. Never in the panel UI. |

Glass stays on the icon, store art and landing page. The panel stays calm and flat (decided in piece 2).

**Wordmark:** "Orion Waypoint" in the system font, semibold. No downloaded fonts, which keeps the zero-network promise.

## Rename in the product

User-facing "OrionHUD" becomes "Orion Waypoint". Internal identifiers stay as they are.

**Must NOT change** (changing them breaks existing users):
- `src/shared/db.ts` `DB_NAME = "orion-hud"`: renaming it would orphan every user's IndexedDB data.
- `src/shared/workflowActions.ts` `BACKUP_APP = "OrionHUD"`: it's the marker inside backup files, so old backups must keep importing. Only the error message text that mentions the name changes.
- Code identifiers (`useOrion`, `OrionError`, `orion-*` notification IDs), the repo folder, and git history.

**Changes:**
- `manifest.json`: `name`, `description`, `action.default_title`, plus a `32` entry in `icons` and `action.default_icon`.
- User-visible strings: notification titles (`background/capture.ts`, `guard.ts`, `menus.ts`, `timesUp.ts`), action titles (`background/notify.ts`, `sidepanel/lib/ui.ts`), context menus (`menus.ts`), the capture box (`content/capture.ts`), error and empty-state copy (`ErrorBoundary.tsx`, `Settings.tsx`, `WorkflowSelector.tsx`, `WorkflowView.tsx`), the panel `<title>`, and the backup error message.
- Context-menu labels *(my call, kept short)*: "Pin as a decision" and "Send to inbox" (revised after final review: Chrome already nests them under an "Orion Waypoint" parent item).
- Console prefixes `[OrionHUD]` become `[Orion Waypoint]`. Code comments: builder's call.
- `README.md` and `PRIVACY.md`: name, tagline and new icon. Dated docs under `docs/` are history and stay unchanged.
- `package.json` `name` becomes `orion-waypoint`, with the lockfile regenerated by `npm install`, not edited by hand.
- `dev/` harness title strings.
- `.gitignore` gets `.superpowers/` (brainstorm mockups).

## Icon pipeline *(my call)*

SVG sources are committed under `icons/src/`, and an `npm run icons` script renders the PNGs with
`@resvg/resvg-js` (dev dependency only, so nothing ships in `dist/`). The PNGs are committed so
a build doesn't depend on the script. resvg supports `feGaussianBlur`, which the frosted nebula needs.
If its output differs visibly from Chrome's rendering in the mockups, fall back to exporting from
headless Chrome, and note it.

## Non-goals

- No panel restyle, gold usage or light theme (piece 2).
- No landing page, store art or screenshots (pieces 3 and 4).
- No change to data format, storage, permissions or behavior.

## Verification

- `npm run typecheck`, `npm test`, `npm run build` all pass.
- `grep -rn "OrionHUD" src dev manifest.json README.md PRIVACY.md` returns only the two
  intentional internal markers (`BACKUP_APP`, plus a comment if kept) and test fixtures that use the backup marker.
- A v0.2 backup JSON (`app: "OrionHUD"`) still imports (existing test in `test/workflowActions.test.ts` keeps passing).
- `git diff` shows `src/shared/db.ts` untouched, so data written before the rename is still read after it.
- The PNGs are exactly 16/32/48/128 px. 128 has transparent pixels in its 16px border.
- In the dev harness and in real Chrome: the toolbar icon, the extensions page (48), the panel title and a notification all say Orion Waypoint.

## Owner's to-dos outside the code

- Trademark search for "Orion Waypoint" (USPTO tmsearch, WIPO) before announcing.
- Optionally register `orionwaypoint.com` (or `.app`) before the LinkedIn post; RDAP showed no record on 2026-11-24.

## Appendix A: icon SVG sources (frosted, as approved)

Shared defs:

```svg
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
  <stop offset=".5" stop-color="#fff" stop-opacity=".08"/>
  <stop offset="1" stop-color="#fff" stop-opacity=".18"/>
</linearGradient>
```

128 (96 artwork, translated 16,16):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <!-- rim gradient (above) -->
    <clipPath id="t"><rect width="96" height="96" rx="22"/></clipPath>
    <linearGradient id="frost" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>
    <filter id="blur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="11"/></filter>
    <filter id="blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <g transform="translate(16 16)">
    <rect width="96" height="96" rx="22" fill="#0e1330"/>
    <g clip-path="url(#t)">
      <circle cx="18" cy="78" r="30" fill="#4f46e5" opacity=".85" filter="url(#blur12)"/>
      <circle cx="86" cy="80" r="22" fill="#9333ea" opacity=".55" filter="url(#blur12)"/>
      <circle cx="64" cy="30" r="22" fill="#f5a524" opacity=".55" filter="url(#blur12)"/>
      <rect width="96" height="96" fill="url(#frost)"/>
    </g>
    <circle cx="20" cy="78" r="3.2" fill="#fff" fill-opacity=".55"/>
    <circle cx="19" cy="66" r="3.6" fill="#fff" fill-opacity=".64"/>
    <circle cx="22.5" cy="54.5" r="4" fill="#fff" fill-opacity=".73"/>
    <circle cx="30" cy="45" r="4.4" fill="#fff" fill-opacity=".82"/>
    <circle cx="40" cy="38.5" r="4.8" fill="#fff" fill-opacity=".91"/>
    <path d="M63 12Q63 33 84 33Q63 33 63 54Q63 33 42 33Q63 33 63 12Z" fill="#fff8e1" filter="url(#blur3)" opacity=".8"/>
    <path d="M63 13Q63 33 83 33Q63 33 63 53Q63 33 43 33Q63 33 63 13Z" fill="#fffaf0"/>
    <rect x=".75" y=".75" width="94.5" height="94.5" rx="21.25" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
  </g>
</svg>
```

32:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <!-- rim gradient (above) -->
    <clipPath id="t"><rect width="32" height="32" rx="7"/></clipPath>
    <filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="32" height="32" rx="7" fill="#0e1330"/>
  <g clip-path="url(#t)">
    <circle cx="6" cy="26" r="10" fill="#4f46e5" opacity=".85" filter="url(#b4)"/>
    <circle cx="21" cy="11" r="8" fill="#f5a524" opacity=".5" filter="url(#b4)"/>
    <rect width="32" height="32" fill="#fff" opacity=".07"/>
  </g>
  <circle cx="6.5" cy="25.5" r="1.9" fill="#fff" opacity=".7"/>
  <circle cx="7" cy="19.5" r="2.1" fill="#fff" opacity=".82"/>
  <circle cx="10.5" cy="14.5" r="2.3" fill="#fff" opacity=".95"/>
  <path d="M21 3.5Q21 11 28.5 11Q21 11 21 18.5Q21 11 13.5 11Q21 11 21 3.5Z" fill="#fffaf0"/>
  <rect x=".5" y=".5" width="31" height="31" rx="6.5" fill="none" stroke="url(#rim)" stroke-width="1"/>
</svg>
```

16 (star to be snapped to the pixel grid at export, e.g. center 10.5,5.5 → tips at 10.5,1 / 15,5.5 / 10.5,10 / 6,5.5):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <defs>
    <clipPath id="t"><rect width="16" height="16" rx="3.5"/></clipPath>
    <filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect width="16" height="16" rx="3.5" fill="#141a44"/>
  <g clip-path="url(#t)"><circle cx="3" cy="13" r="5" fill="#4f46e5" opacity=".9" filter="url(#b2)"/></g>
  <circle cx="3.5" cy="12.5" r="1.3" fill="#fff" opacity=".8"/>
  <circle cx="4.5" cy="8.5" r="1.3" fill="#fff" opacity=".92"/>
  <path d="M10.5 1.2Q10.5 5.5 14.8 5.5Q10.5 5.5 10.5 9.8Q10.5 5.5 6.2 5.5Q10.5 5.5 10.5 1.2Z" fill="#fff3c4"/>
</svg>
```

Live mockups: `.superpowers/brainstorm/634-1795514175/content/icon-glass.html` (local only, gitignored).

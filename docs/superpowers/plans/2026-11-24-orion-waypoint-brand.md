# Orion Waypoint Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the OrionHUD extension as "Orion Waypoint": new name in every user-facing string, new frosted "Way Back" icon set (16/32/48/128), with zero change to stored data or backup compatibility.

**Architecture:** One `APP_NAME` constant in `src/shared/brand.ts` replaces every hard-coded user-facing name. Icons are SVG sources in `icons/src/` rendered to committed PNGs by a dev-only Node script using `@resvg/resvg-js`. Guard tests scan source text (via Vite `import.meta.glob` raw imports, so no `@types/node` is needed) to keep the old name from creeping back and to pin the two internal identifiers that must never change.

**Tech Stack:** TypeScript 6, React 19, Vite 8 + @crxjs, Vitest 4, @resvg/resvg-js (new devDependency), Chrome MV3.

**Spec:** `docs/superpowers/specs/2026-11-24-orion-waypoint-brand-design.md`

## Global Constraints

- Product name, exactly: `Orion Waypoint` (both words in every user-facing string).
- Manifest description, exactly: `Saves your tabs, AI chats and next step whenever you get pulled away, so you pick up exactly where you left off.` (112 chars; Chrome limit 132).
- Tagline (README, not the manifest): `Got pulled away? Pick up exactly where you left off.`
- `src/shared/db.ts` `DB_NAME = "orion-hud"` must not change.
- `src/shared/workflowActions.ts` `BACKUP_APP = "OrionHUD"` must not change (backup file marker).
- Code identifiers (`useOrion`, `OrionError`, `orion-*` IDs) and dated docs under `docs/` do not change.
- No runtime dependency added; no network requests; no downloaded fonts.
- 128px icon: 96×96 artwork, 16px fully transparent padding on every side, no border.
- `@resvg/resvg-js` is a devDependency only; nothing new lands in `dist/` except the PNGs.

## Review Focus

1. **Updating users keep their data.** A v0.2 user who updates must see all workflows. Pinned by the `DB_NAME` guard test (Task 1).
2. **Old backups still import.** A file with `"app": "OrionHUD"` exported by v0.2 must import after the rename. Pinned by the backup test (Task 1).
3. **Stray old name in a corner of the UI** (a notification, the capture box, a context menu). Pinned by the source-scan test (Task 1).
4. **The 128 icon gets rejected or looks cropped on the store because the padding isn't transparent.** Pinned by the render script's border-alpha assertion and the PNG-dimension test (Task 2).
5. **The manifest description silently exceeds Chrome's 132-char limit** after a later copy edit. Pinned by the manifest test (Task 3).

---

### Task 1: Brand constant and user-facing rename

**Files:**
- Create: `src/shared/brand.ts`
- Create: `test/brand.test.ts`
- Modify (user-facing strings → `APP_NAME`): `src/background/capture.ts:20,24,48`, `src/background/guard.ts:34`, `src/background/menus.ts:15-16,30,45`, `src/background/notify.ts:29`, `src/background/timesUp.ts:25`, `src/content/capture.ts:64-65,73`, `src/sidepanel/components/ErrorBoundary.tsx:16,23`, `src/sidepanel/components/Settings.tsx:150`, `src/sidepanel/components/WorkflowSelector.tsx:31`, `src/sidepanel/components/WorkflowView.tsx:144`, `src/sidepanel/hooks/useOrion.ts:32`, `src/sidepanel/lib/format.ts:21`, `src/sidepanel/lib/ui.ts:24`, `src/sidepanel/index.tsx:7`, `src/sidepanel/index.html:7` (literal `Orion Waypoint`; HTML can't import)
- Modify (comments only, literal `Orion Waypoint`): `src/shared/messages.ts:1`, `src/shared/savePoints.ts:8`, `src/shared/urlMatching.ts:36`, `src/sidepanel/index.css:1`
- Modify: `src/shared/workflowActions.ts:561,583` (keep the marker, change the message)
- Test: `test/brand.test.ts`, `test/workflowActions.test.ts:217-234`

**Interfaces:**
- Produces: `export const APP_NAME = "Orion Waypoint";` from `src/shared/brand.ts` (Task 3 imports it in the manifest test).

- [ ] **Step 1: Write the failing tests in `test/brand.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { APP_NAME } from "../src/shared/brand";

const sources = import.meta.glob(["../src/**/*.{ts,tsx,css,html}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// The only line allowed to keep the old name: the backup file marker.
const ALLOWED = [/^const BACKUP_APP = "OrionHUD";$/];

describe("brand", () => {
  it("APP_NAME is Orion Waypoint", () => {
    expect(APP_NAME).toBe("Orion Waypoint");
  });

  it("no source file shows the old name outside the backup marker", () => {
    const hits = Object.entries(sources).flatMap(([file, text]) =>
      text.split("\n").map((line, i) => ({ file, n: i + 1, line: line.trim() }))
        .filter(({ line }) => /OrionHUD|Orion HUD/.test(line) && !ALLOWED.some((re) => re.test(line))));
    expect(hits).toEqual([]);
  });

  it("storage name is frozen so updating users keep their data", () => {
    expect(sources["../src/shared/db.ts"]).toContain('const DB_NAME = "orion-hud";');
  });

  it("backup marker is frozen so old backups keep importing", () => {
    expect(sources["../src/shared/workflowActions.ts"]).toContain('const BACKUP_APP = "OrionHUD";');
  });
});
```

Add a menu-title test to the same file using a minimal `chrome.contextMenus` stub (`removeAll` calls its callback synchronously, `create` is `vi.fn()`). Call `createMenus()` and assert the two `create` calls received titles `"Pin as a decision (Orion Waypoint)"` and `"Send to Orion Waypoint inbox"`.

In `test/workflowActions.test.ts`, inside the existing backup test, after the `app: "Other"` rejection add:

```ts
await expect(importBackup(JSON.stringify({ app: "Other", workflows: [] }))).rejects.toThrow("That file isn't an Orion Waypoint backup.");
```

and after the final import, add a v0.2-format file that must still import:

```ts
const legacy = JSON.stringify({ app: "OrionHUD", version: 2, workflows: [{ id: "legacy-1", name: "From v0.2", globalGracePeriodMins: 5 }] });
await expect(importBackup(legacy)).resolves.toEqual({ imported: 1 });
```

(If `normalizeWorkflow` needs more fields for a valid workflow, take the minimum shape from `test/fixtures.ts`.)

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run test/brand.test.ts test/workflowActions.test.ts`
Expected: FAIL. `../src/shared/brand` doesn't exist, the scan lists about 30 hits, the menu titles differ, and the backup message still says OrionHUD.

- [ ] **Step 3: Create `src/shared/brand.ts` exporting `APP_NAME`, then replace each listed string**

Exact copy:
- Notification titles in `capture.ts`, `menus.ts`: `APP_NAME`.
- `guard.ts`: `` `${APP_NAME}: off track` ``. `timesUp.ts`: `` `${APP_NAME}: time's up` ``.
- `notify.ts`: `on ? \`${APP_NAME}: pick up where you left off\` : APP_NAME`. `ui.ts`: `APP_NAME`.
- Context menus: `"Pin as a decision (Orion Waypoint)"`, `` `Send to ${APP_NAME} inbox` ``.
- `content/capture.ts`: aria-labels `` `${APP_NAME} save point` `` / `` `${APP_NAME} inbox capture` ``; the default label and right-hand span `APP_NAME`.
- Console prefixes: `` `[${APP_NAME}]` ``.
- `ErrorBoundary.tsx` heading: `{APP_NAME} hit a snag`. `Settings.tsx`: `{APP_NAME} {version} · local-only · no accounts, no tracking`.
- `WorkflowSelector.tsx` / `WorkflowView.tsx` / `index.tsx`: swap the name in the existing sentence, wording otherwise unchanged.
- `workflowActions.ts`: keep `const BACKUP_APP = "OrionHUD";` byte-for-byte. Put a comment above it, without the old name, saying it is the frozen v0.1/v0.2 file marker. The message becomes `` `That file isn't an ${APP_NAME} backup.` ``.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run test/brand.test.ts test/workflowActions.test.ts` → Expected: PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(orion-waypoint): rename user-facing OrionHUD to Orion Waypoint"
```

---

### Task 2: Frosted icon set and render pipeline

**Files:**
- Create: `icons/src/icon-128.svg`, `icons/src/icon-32.svg`, `icons/src/icon-16.svg` (content: spec Appendix A, with the shared `rim` gradient inlined in each file's `<defs>`)
- Create: `scripts/render-icons.mjs`
- Create: `test/icons.test.ts`
- Modify: `package.json` (devDependency `@resvg/resvg-js`, script `"icons": "node scripts/render-icons.mjs"`)
- Modify: `manifest.json` (add `"32": "icons/icon32.png"` to both `icons` and `action.default_icon`)
- Overwrite: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`; create `icons/icon32.png`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `icons/icon{16,32,48,128}.png` at exactly those pixel sizes; the manifest references all four.

- [ ] **Step 1: Write the failing test in `test/icons.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

const pngs = import.meta.glob("../icons/*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;

function size(dataUrl: string): [number, number] {
  const bin = atob(dataUrl.split(",")[1]!);
  const u32 = (o: number) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
  return [u32(16), u32(20)]; // IHDR width, height
}

describe("icons", () => {
  it.each([16, 32, 48, 128])("icon%i.png exists at %ipx and is in the manifest", (px) => {
    const url = pngs[`../icons/icon${px}.png`];
    expect(url, `icons/icon${px}.png missing`).toBeDefined();
    expect(size(url!)).toEqual([px, px]);
    expect((manifest.icons as Record<string, string>)[String(px)]).toBe(`icons/icon${px}.png`);
  });
  it("toolbar icon offers 16 and 32", () => {
    expect(manifest.action.default_icon).toMatchObject({ "16": "icons/icon16.png", "32": "icons/icon32.png" });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/icons.test.ts`
Expected: FAIL. `icon32.png` is missing and the manifest has no `"32"` entry.

- [ ] **Step 3: Add the SVG sources and install resvg**

Copy the three SVGs from the spec's Appendix A into `icons/src/`. In `icon-16.svg`, use the pixel-snapped star path `M10.5 1Q10.5 5.5 15 5.5Q10.5 5.5 10.5 10Q10.5 5.5 6 5.5Q10.5 5.5 10.5 1Z`.
Run: `npm install --save-dev @resvg/resvg-js`

- [ ] **Step 4: Write `scripts/render-icons.mjs`**

Use `new Resvg(svg, { fitTo: { mode: "width", value: px } }).render()`. Render map: `icon-128.svg` → 128 and 48, `icon-32.svg` → 32, `icon-16.svg` → 16. Write `asPng()` to `icons/icon<px>.png`. Before writing the 128, assert that every pixel with `x<16 || x>=112 || y<16 || y>=112` has alpha 0 (from `rendered.pixels`, RGBA). Throw with the first offending coordinate if not. Print one line per file written.

- [ ] **Step 5: Render, add the manifest entries, run the tests**

Run: `npm run icons` → Expected: 4 lines written, no throw.
Add the `"32"` entries to `manifest.json`.
Run: `npx vitest run test/icons.test.ts` → Expected: PASS.
Open the four PNGs and compare them by eye with `.superpowers/brainstorm/634-1795514175/content/icon-glass.html` (frosted column). If resvg's blur differs visibly from Chrome's, export from headless Chrome instead and note it in the commit message.

- [ ] **Step 6: Commit**

```bash
git add icons scripts package.json package-lock.json manifest.json test/icons.test.ts
git commit -m "feat(orion-waypoint): frosted Way Back icon set with resvg render pipeline"
```

---

### Task 3: Manifest identity, package name, docs, harness

**Files:**
- Create: `test/manifest.test.ts`
- Modify: `manifest.json` (`name`, `description`, `action.default_title`)
- Modify: `package.json` (`name` → `orion-waypoint`, `description` → the manifest description), then `npm install` to regenerate the lockfile name (never hand-edit the lockfile)
- Modify: `README.md` (title, tagline as the first line, the "Pin to … as a decision" row, icon image `icons/icon128.png` under the title), `PRIVACY.md` (product name, 4 places)
- Modify: `dev/index.html:6` → `Orion Waypoint dev harness`
- Modify: `.gitignore` (add `.superpowers/`)

**Interfaces:**
- Consumes: `APP_NAME` from `src/shared/brand.ts` (Task 1).

- [ ] **Step 1: Write the failing test in `test/manifest.test.ts`**

```ts
import { expect, it } from "vitest";
import manifest from "../manifest.json";
import { APP_NAME } from "../src/shared/brand";

const DESCRIPTION = "Saves your tabs, AI chats and next step whenever you get pulled away, so you pick up exactly where you left off.";

it("manifest carries the brand", () => {
  expect(manifest.name).toBe(APP_NAME);
  expect(manifest.action.default_title).toBe(APP_NAME);
  expect(manifest.description).toBe(DESCRIPTION);
  expect(manifest.description.length).toBeLessThanOrEqual(132);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/manifest.test.ts` → Expected: FAIL (name is `OrionHUD`).

- [ ] **Step 3: Apply the manifest, package, docs, harness and .gitignore edits listed above**

- [ ] **Step 4: Run the full suite and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass; `dist/manifest.json` has `"name": "Orion Waypoint"` and lists all four icons.
Run: `grep -rn "OrionHUD" README.md PRIVACY.md manifest.json dev/index.html` → Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add manifest.json package.json package-lock.json README.md PRIVACY.md dev/index.html .gitignore test/manifest.test.ts
git commit -m "feat(orion-waypoint): Orion Waypoint manifest identity, docs and harness"
```

---

### Task 4: End-to-end check

- [ ] **Step 1: Harness check.** Start `harness` from `.claude/launch.json` and open `/?reset&seed`. Confirm the panel shows no "OrionHUD", the Settings footer reads `Orion Waypoint 0.2.0 · local-only…`, and the console is clean. Take a screenshot.
- [ ] **Step 2: Real Chrome (owner).** Load `dist/` unpacked and confirm:
  - the frosted icon in a dark and a light toolbar, and on `chrome://extensions` (48px)
  - hovering the toolbar icon shows "Orion Waypoint"
  - right-click selected text shows the two new menu labels
  - `Alt+Shift+S` on `chrome://settings` shows a notification titled "Orion Waypoint"
  - a v0.2 backup imports
- [ ] **Step 3: Update `docs/IMPLEMENTATION_PLAN.md`** with a row for the brand piece and the "not yet verified in real Chrome" items from Step 2. Commit with `docs(orion-waypoint): record brand piece status`.

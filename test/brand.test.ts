import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "../src/shared/brand";
import { createMenus } from "../src/background/menus";
import { backupFileName } from "../src/sidepanel/lib/format";

const sources = import.meta.glob(["../src/**/*.{ts,tsx,css,html}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// Every spelling of the old name: OrionHUD, Orion HUD, orion-hud, orion_hud, orionhud, ...
const OLD_NAME = /orion[\s_-]?hud/i;

// Exact lines allowed to keep the old name: frozen internal identifiers that users never see.
const ALLOWED = new Set([
  'const BACKUP_APP = "OrionHUD";', // backup file marker: old backups must keep importing
  'const DB_NAME = "orion-hud";', // IndexedDB name: updating users keep their data
  'const HOST_ID = "orionhud-capture-host";', // capture box host element id (internal DOM id)
]);

describe("brand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("APP_NAME is Orion Waypoint", () => {
    expect(APP_NAME).toBe("Orion Waypoint");
  });

  it("no source file shows the old name outside the frozen identifiers", () => {
    const hits = Object.entries(sources).flatMap(([file, text]) =>
      text.split("\n").map((line, i) => ({ file, n: i + 1, line: line.trim() }))
        .filter(({ line }) => OLD_NAME.test(line) && !ALLOWED.has(line)));
    expect(hits).toEqual([]);
  });

  it("the old-name scan catches every spelling", () => {
    for (const s of ["OrionHUD", "Orion HUD", "orion-hud", "orion_hud", "orionhud", "ORIONHUD"]) {
      expect(OLD_NAME.test(s), s).toBe(true);
    }
  });

  it("backups export as orion-waypoint-backup-YYYY-MM-DD.json", () => {
    expect(backupFileName(new Date("2026-11-24T15:30:00Z"))).toBe("orion-waypoint-backup-2026-11-24.json");
    expect(backupFileName(new Date())).toMatch(/^orion-waypoint-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("storage name is frozen so updating users keep their data", () => {
    expect(sources["../src/shared/db.ts"]).toContain('const DB_NAME = "orion-hud";');
  });

  it("backup marker is frozen so old backups keep importing", () => {
    expect(sources["../src/shared/workflowActions.ts"]).toContain('const BACKUP_APP = "OrionHUD";');
  });

  it("context menu titles use the new name", () => {
    const create = vi.fn();
    vi.stubGlobal("chrome", { contextMenus: { removeAll: (cb: () => void) => cb(), create } });
    createMenus();
    expect(create.mock.calls.map(([o]) => o.title)).toEqual([
      "Pin as a decision (Orion Waypoint)",
      "Send to Orion Waypoint inbox",
    ]);
  });
});

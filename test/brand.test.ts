import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "../src/shared/brand";
import { createMenus } from "../src/background/menus";

const sources = import.meta.glob(["../src/**/*.{ts,tsx,css,html}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// The only line allowed to keep the old name: the backup file marker.
const ALLOWED = [/^const BACKUP_APP = "OrionHUD";$/];

describe("brand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

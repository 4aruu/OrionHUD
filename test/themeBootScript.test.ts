// public/theme-boot.js is a classic script that sets the theme before first paint.
// It can't import applyTheme, so this keeps the two in step.
import { describe, expect, it } from "vitest";
import { applyTheme, parseThemePref, THEME_KEY } from "../src/shared/theme";
import SOURCE from "../public/theme-boot.js?raw";

function stubRoot(initial?: string) {
  const attrs = new Map<string, string>();
  if (initial) attrs.set("data-theme", initial);
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
}

/** Runs the script with its only globals stubbed; returns the root's data-theme. */
function runScript(stored: string | null | Error, initial?: string): string | undefined {
  const root = stubRoot(initial);
  const localStorage = {
    getItem: (k: string) => {
      if (stored instanceof Error) throw stored;
      return k === THEME_KEY ? stored : null;
    },
  };
  new Function("localStorage", "document", SOURCE)(localStorage, { documentElement: root });
  return root.attrs.get("data-theme");
}

function viaApplyTheme(stored: string | null, initial?: string): string | undefined {
  const root = stubRoot(initial);
  applyTheme(parseThemePref(stored), root as unknown as HTMLElement);
  return root.attrs.get("data-theme");
}

describe("public/theme-boot.js", () => {
  for (const stored of ["light", "dark", "system", "neon", "", null]) {
    for (const initial of [undefined, "light", "dark"]) {
      it(`matches applyTheme for ${JSON.stringify(stored)} (root starts ${initial ?? "bare"})`, () => {
        expect(runScript(stored, initial)).toBe(viaApplyTheme(stored, initial));
      });
    }
  }

  it("falls back to the system theme when storage is blocked", () => {
    expect(runScript(new Error("SecurityError"), "dark")).toBeUndefined();
  });

  it("is a plain classic script: no module syntax", () => {
    expect(SOURCE).not.toMatch(/^\s*(import|export)\b/m);
  });
});

describe("pages load it in <head>", () => {
  const pages = {
    ...import.meta.glob("../src/*/index.html", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("../dev/*.html", { query: "?raw", import: "default", eager: true }),
  } as Record<string, string>;
  it("finds the four pages", () => {
    expect(Object.keys(pages).sort()).toEqual(["../dev/index.html", "../dev/welcome.html", "../src/sidepanel/index.html", "../src/welcome/index.html"]);
  });
  for (const [page, html] of Object.entries(pages)) {
    it(page, () => {
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head).toContain('<script src="/theme-boot.js"></script>');
    });
  }
});

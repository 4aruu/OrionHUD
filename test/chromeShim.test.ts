import { describe, expect, it } from "vitest";
import "../dev/chromeShim";

// Everything the panel bundle can call: the panel itself plus the shared and platform code it imports.
const sources = import.meta.glob(["../src/sidepanel/**/*.{ts,tsx}", "../src/shared/**/*.ts", "../src/platform/**/*.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Every `chrome.a.b(` / `chrome.a.b.c(` call in the panel's code. Optional calls (`chrome.x?.y`) are feature-detected and skipped. */
function panelChromeCalls(): string[] {
  const calls = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/\bchrome((?:\.[A-Za-z]+){2,3})\(/g)) calls.add(m[1]!.slice(1));
  }
  return [...calls].sort();
}

describe("dev harness chrome shim", () => {
  it("finds the panel's chrome calls", () => {
    // Guards the scan itself: an empty list would make the next test pass vacuously.
    expect(panelChromeCalls()).toEqual(expect.arrayContaining(["tabs.create", "windows.update", "storage.session.get"]));
  });

  it("implements every chrome API the panel calls, so no button throws in the harness", () => {
    const shim = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const missing = panelChromeCalls().filter((path) => {
      const fn = path.split(".").reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], shim);
      return typeof fn !== "function";
    });
    expect(missing).toEqual([]);
  });
});

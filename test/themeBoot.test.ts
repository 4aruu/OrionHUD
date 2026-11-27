import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { THEME_KEY } from "../src/shared/theme";

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

let mirror: Map<string, string>;
let listeners: Listener[];
const root = () => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
  } as unknown as HTMLElement & { attrs: Map<string, string> };
};

function stubChrome(get: () => Promise<Record<string, unknown>>) {
  listeners = [];
  vi.stubGlobal("chrome", { storage: { local: { get }, onChanged: { addListener: (l: Listener) => listeners.push(l) } } });
}

beforeEach(async () => {
  mirror = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => mirror.get(k) ?? null, setItem: (k: string, v: string) => void mirror.set(k, v) });
  vi.stubGlobal("document", { documentElement: root() });
  stubChrome(async () => ({}));
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  // Importing runs the side-effect boot against the stubs; tests then call bootTheme with their own root.
  const { bootTheme } = await import("../src/shared/themeBoot");
  await new Promise((r) => setTimeout(r, 0)); // let the import-time boot settle
  mirror.clear();
  return bootTheme;
}

it("repairs a stale mirror after a successful storage read", async () => {
  const bootTheme = await load();
  mirror.set(THEME_KEY, "dark");
  stubChrome(async () => ({ [THEME_KEY]: "light" }));
  const r = root();
  await bootTheme(r);
  expect(r.attrs.get("data-theme")).toBe("light");
  expect(mirror.get(THEME_KEY)).toBe("light");
});

it("repairs a missing mirror with 'system' when storage has no value", async () => {
  const bootTheme = await load();
  stubChrome(async () => ({}));
  const r = root();
  await bootTheme(r);
  expect(r.attrs.has("data-theme")).toBe(false);
  expect(mirror.get(THEME_KEY)).toBe("system");
});

it("repairs the mirror when another panel changes the preference", async () => {
  const bootTheme = await load();
  stubChrome(async () => ({ [THEME_KEY]: "dark" }));
  const r = root();
  await bootTheme(r);
  listeners[0]!({ [THEME_KEY]: { newValue: "light" } }, "local");
  expect(r.attrs.get("data-theme")).toBe("light");
  expect(mirror.get(THEME_KEY)).toBe("light");
  listeners[0]!({ other: { newValue: "dark" } }, "local");
  listeners[0]!({ [THEME_KEY]: { newValue: "dark" } }, "sync");
  expect(r.attrs.get("data-theme")).toBe("light");
});

it("a failed storage read keeps the mirror's theme", async () => {
  const bootTheme = await load();
  mirror.set(THEME_KEY, "light");
  stubChrome(async () => {
    throw new Error("boom");
  });
  const r = root();
  await bootTheme(r);
  expect(r.attrs.get("data-theme")).toBe("light");
  expect(mirror.get(THEME_KEY)).toBe("light");
});

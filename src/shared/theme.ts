export type ThemePref = "system" | "light" | "dark";

export const THEME_KEY = "orion-theme";

export function parseThemePref(raw: unknown): ThemePref {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export async function readThemePref(): Promise<ThemePref> {
  try {
    const got = await chrome.storage.local.get(THEME_KEY);
    return parseThemePref(got[THEME_KEY]);
  } catch {
    return "system";
  }
}

/** Persists the choice; the localStorage mirror lets the page paint the right theme before React mounts. */
export async function writeThemePref(pref: ThemePref): Promise<void> {
  await chrome.storage.local.set({ [THEME_KEY]: pref });
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: the chrome.storage value still applies on next load.
  }
}

/**
 * "system" removes the attribute so the prefers-color-scheme rule decides.
 * public/theme-boot.js repeats this for first paint (test/themeBootScript.test.ts keeps them equal).
 */
export function applyTheme(pref: ThemePref, root: HTMLElement = document.documentElement): void {
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/**
 * A user's Appearance choice: shown at once, then saved. If saving fails the
 * previous choice comes back and `onError` reports it.
 */
export async function applyThemeChoice(
  pref: ThemePref,
  previous: ThemePref,
  { write, apply, onError }: { write: (p: ThemePref) => Promise<void>; apply: (p: ThemePref) => void; onError: (err: unknown) => void }
): Promise<void> {
  apply(pref);
  try {
    await write(pref);
  } catch (err) {
    apply(previous);
    onError(err);
  }
}

/** Calls `cb` when the stored preference changes (any panel or window). Returns the unsubscribe. */
export function onThemePrefChange(cb: (pref: ThemePref) => void): () => void {
  const onChanged = typeof chrome !== "undefined" ? chrome.storage?.onChanged : undefined;
  if (!onChanged) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[THEME_KEY]) cb(parseThemePref(changes[THEME_KEY].newValue));
  };
  onChanged.addListener(listener);
  return () => onChanged.removeListener(listener);
}

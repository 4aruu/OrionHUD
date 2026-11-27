export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "orion-theme";

export function parseThemePref(raw: unknown): ThemePref {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function resolveTheme(pref: ThemePref, systemPrefersLight: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersLight ? "light" : "dark";
  return pref;
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

/** "system" removes the attribute so the prefers-color-scheme rule decides. */
export function applyTheme(pref: ThemePref, root: HTMLElement = document.documentElement): void {
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

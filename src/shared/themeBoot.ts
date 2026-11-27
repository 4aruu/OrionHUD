// Side-effect module, imported before the stylesheets. First paint is handled by the
// classic script public/theme-boot.js in each page's <head> (a module script can run
// after first paint). The localStorage mirror is synchronous; chrome.storage.local is
// the source of truth. After a successful read (or a change from another panel) the
// theme is applied and the mirror repaired, so the next load paints correctly first.
import { applyTheme, parseThemePref, THEME_KEY } from "./theme";

function mirrorGet(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function mirrorSet(pref: string): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: chrome.storage still holds the value.
  }
}

/** Applies an authoritative preference and repairs the mirror. */
export function reconcileTheme(raw: unknown, root?: HTMLElement): void {
  const pref = parseThemePref(raw);
  applyTheme(pref, root);
  mirrorSet(pref);
}

export async function bootTheme(root?: HTMLElement): Promise<void> {
  // 1. Synchronous paint from the mirror (public/theme-boot.js already did this before first paint).
  applyTheme(parseThemePref(mirrorGet()), root);
  // 2. Listen first, so a change made while the read is in flight isn't lost, and isn't undone by it.
  let changedDuringRead = false;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[THEME_KEY]) return;
      changedDuringRead = true;
      reconcileTheme(changes[THEME_KEY].newValue, root);
    });
  } catch {
    // No chrome.storage (unexpected outside tests).
  }
  // 3. Reconcile with storage only when the read actually succeeded; a failed read keeps the mirror's theme.
  try {
    const got = await chrome.storage.local.get(THEME_KEY);
    if (!changedDuringRead) reconcileTheme(got[THEME_KEY], root);
  } catch {
    // Keep what the mirror painted.
  }
}

void bootTheme();

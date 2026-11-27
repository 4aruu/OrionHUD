// Side-effect module: import before the stylesheets so the right theme is on <html>
// before first paint. The localStorage mirror is synchronous; chrome.storage.local is
// the source of truth and corrects the mirror (and follows changes from other panels).
import { applyTheme, parseThemePref, readThemePref, THEME_KEY } from "./theme";

try {
  applyTheme(parseThemePref(localStorage.getItem(THEME_KEY)));
} catch {
  // Storage blocked: fall through to the chrome.storage read below.
}

void readThemePref().then((pref) => applyTheme(pref));

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[THEME_KEY]) applyTheme(parseThemePref(changes[THEME_KEY].newValue));
  });
} catch {
  // No chrome.storage (unexpected outside tests): the initial apply above still holds.
}

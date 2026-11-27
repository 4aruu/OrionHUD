// Sets the theme before first paint. A classic (non-module) script in each page's
// <head>, because module scripts are deferred and can run after the first frame.
// Same rule as applyTheme in src/shared/theme.ts (test/themeBootScript.test.ts keeps
// them equal); src/shared/themeBoot.ts then reconciles with chrome.storage.
(function () {
  var pref = null;
  try {
    pref = localStorage.getItem("orion-theme");
  } catch (e) {
    // Storage blocked: paint the system theme; themeBoot.ts applies the stored choice.
  }
  var root = document.documentElement;
  if (pref === "light" || pref === "dark") root.setAttribute("data-theme", pref);
  else root.removeAttribute("data-theme");
})();

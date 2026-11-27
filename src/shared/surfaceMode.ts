// Where the UI opens. The service worker decides (src/background/surface.ts) and
// keeps it in chrome.storage.session; the welcome page reads it for "Open the panel".
export type SurfaceMode = "panel" | "window";
export const SURFACE_MODE_KEY = "surfaceMode";

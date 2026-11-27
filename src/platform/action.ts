// Toolbar-pin state. getUserSettings / onUserSettingsChanged are missing in
// some Chromium browsers, so every call is feature-detected.

/** true/false when the browser reports it, null when it can't. */
export async function readPinned(): Promise<boolean | null> {
  try {
    if (typeof chrome.action?.getUserSettings !== "function") return null;
    const settings = await chrome.action.getUserSettings();
    return typeof settings?.isOnToolbar === "boolean" ? settings.isOnToolbar : null;
  } catch {
    return null;
  }
}

/** Calls cb when the user pins/unpins. Returns an unsubscribe function. */
export function onPinnedChange(cb: () => void): () => void {
  const event = chrome.action?.onUserSettingsChanged;
  if (!event || typeof event.addListener !== "function") return () => {};
  const listener = () => cb();
  event.addListener(listener);
  return () => event.removeListener(listener);
}

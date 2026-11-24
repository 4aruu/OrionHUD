// Where the UI opens. Browsers with the side panel API (Chrome, Edge, Brave,
// Opera) get the side panel; browsers without it (Arc) or where it fails get
// the same page in a small standalone window. The window is also reachable
// everywhere via the Alt+Shift+O command and the toolbar icon's right-click
// menu: the escape hatch where a side panel exists but misbehaves (Vivaldi).

export type SurfaceMode = "panel" | "window";

/** Same page as manifest.side_panel.default_path (test/surface.test.ts keeps them in step). */
export const PANEL_PAGE = "src/sidepanel/index.html";
export const PANEL_WINDOW = { width: 420, height: 720 } as const;
export const COMMAND_WINDOW = "open-window";

const MODE_KEY = "surfaceMode";
const WINDOW_KEY = "panelWindowId";

// storage.session survives service-worker restarts within a browser session and
// is cleared on browser restart, which is exactly the lifetime of a window id.
async function sessionGet(key: string): Promise<unknown> {
  try {
    return (await chrome.storage.session.get(key))[key];
  } catch {
    return undefined;
  }
}

async function sessionSet(items: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.session.set(items);
  } catch {
    // Without session storage we just open a fresh window each time.
  }
}

export async function initSurface(): Promise<SurfaceMode> {
  let mode: SurfaceMode = "window";
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      mode = "panel";
    } catch {
      mode = "window";
    }
  }
  await sessionSet({ [MODE_KEY]: mode });
  return mode;
}

/**
 * Toolbar click. Chrome doesn't promise to suppress action.onClicked while the
 * side panel opens on click, so panel mode must ignore it rather than also
 * opening a window.
 */
export async function onActionClicked(): Promise<void> {
  const mode = (await sessionGet(MODE_KEY)) ?? (await initSurface());
  if (mode === "panel") return;
  await openPanelWindow();
}

/** Focuses the open panel window, or opens one at the right edge of the user's browser window. */
export async function openPanelWindow(): Promise<void> {
  const existing = await sessionGet(WINDOW_KEY);
  if (typeof existing === "number") {
    try {
      await chrome.windows.update(existing, { focused: true });
      return;
    } catch {
      // The user closed it; open a new one.
    }
  }
  const data: chrome.windows.CreateData = {
    url: chrome.runtime.getURL(PANEL_PAGE),
    type: "popup",
    width: PANEL_WINDOW.width,
    height: PANEL_WINDOW.height,
    focused: true,
  };
  try {
    const anchor = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (anchor.state === "normal" && anchor.left !== undefined && anchor.top !== undefined && anchor.width !== undefined) {
      data.left = Math.max(0, anchor.left + anchor.width - PANEL_WINDOW.width);
      data.top = anchor.top;
    }
  } catch {
    // No normal window to sit beside; let the browser place it.
  }
  const win = await chrome.windows.create(data);
  if (win?.id !== undefined) await sessionSet({ [WINDOW_KEY]: win.id });
}

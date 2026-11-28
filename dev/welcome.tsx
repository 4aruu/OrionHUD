// Harness for the welcome tab: /welcome.html?reset for a fresh install.
// ?seed loads the demo data, ?tabs starts with tab memory granted,
// ?unbound clears the save shortcut, ?pinned starts pinned, ?window puts the
// service worker's surface mode in "window" (Open the panel sends the message).
// Alt+Shift+S stands in for the save-point command's extension-page fallback.
import "./chromeShim";
import "../src/shared/themeBoot";
import "../src/shared/tokens.css";
import "../src/sidepanel/index.css";
import "../src/welcome/welcome.css";
import { getMeta, getWorkflow } from "../src/shared/db";
import { recordSavePoint } from "../src/shared/workflowActions";
import { captureTabs } from "../src/platform/tabs";
import { findTaskNode } from "../src/shared/taskTree";
import { SURFACE_MODE_KEY } from "../src/shared/surfaceMode";

interface Shim {
  setTabsGranted(v: boolean): void;
  setSaveShortcut(v: string | null): void;
  setPinned(v: boolean): void;
}
const shim = (globalThis as unknown as { __orionShim: Shim }).__orionShim;

/** What src/background/capture.ts does for the command on an extension page: a save point, no next step. */
async function simulateSaveCommand(): Promise<void> {
  const meta = await getMeta();
  if (!meta.activeWorkflowId || !meta.currentActiveNodeId) return;
  const wf = await getWorkflow(meta.activeWorkflowId);
  const task = wf && findTaskNode(wf.rootNodes, meta.currentActiveNodeId);
  if (!wf || !task) return;
  const tabs = await captureTabs(task.title);
  await recordSavePoint(wf.id, task.id, { trigger: "manual", ...tabs });
  await chrome.runtime.sendMessage({ type: "ORION_STATE_CHANGED", reason: "command" });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  shim.setTabsGranted(params.has("tabs"));
  if (params.has("unbound")) shim.setSaveShortcut(null);
  if (params.has("pinned")) shim.setPinned(true);
  if (params.has("window")) await chrome.storage.session.set({ [SURFACE_MODE_KEY]: "window" });
  if (params.has("reset")) {
    // A fresh install has no remembered "Not now" either (Welcome.tsx).
    localStorage.removeItem("orion-welcome-tabs-answered");
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("orion-hud");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
  if (params.has("seed")) {
    const { seedDemo } = await import("./seed");
    await seedDemo();
  }
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && e.code === "KeyS") {
      e.preventDefault();
      void simulateSaveCommand();
    }
  });
  const [{ default: React }, { default: ReactDOM }, { default: WelcomeApp }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("../src/welcome/Welcome"),
  ]);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <WelcomeApp />
    </React.StrictMode>
  );
}

void boot();

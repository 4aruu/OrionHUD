import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import iconUrl from "../../icons/icon128.png";
import { APP_NAME } from "../shared/brand";
import type { ExtensionMessage } from "../shared/messages";
import { SURFACE_MODE_KEY, type SurfaceMode } from "../shared/surfaceMode";
import { readPinned, onPinnedChange } from "../platform/action";
import { getShortcut, openShortcutSettings } from "../platform/commands";
import { hasTabsPermission, requestTabsPermission } from "../platform/tabs";
import { BrandName } from "../sidepanel/components/BrandName";
import { ErrorBoundary } from "../sidepanel/components/ErrorBoundary";
import { MotionRoot } from "../sidepanel/components/Motion";
import { ResumeCard } from "../sidepanel/components/ResumeCard";
import { Toast, type ToastState } from "../sidepanel/components/Toast";
import { useNow, useOrion } from "../sidepanel/hooks/useOrion";
import { useBusy } from "../sidepanel/hooks/useBusy";
import { importBackupFile } from "../sidepanel/lib/backup";
import { countLabel, errorMessage } from "../sidepanel/lib/format";
import type { Ui } from "../sidepanel/lib/ui";
import { attachNextStep, saveFromWelcome } from "./actions";
import { computeWelcome, type StepId, type StepStatus } from "./steps";
import { PinStep } from "./PinStep";
import { SaveStep } from "./SaveStep";
import { TabsStep } from "./TabsStep";
import { TaskStep } from "./TaskStep";

const ORDER: StepId[] = ["task", "tabs", "save", "pin"];
const noop = () => undefined;
// "Not now" (or any answer to the tab-memory prompt) survives a reload of this page.
const TABS_ANSWERED_KEY = "orion-welcome-tabs-answered";

function readTabsAnswered(): boolean {
  try {
    return localStorage.getItem(TABS_ANSWERED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTabsAnswered(): void {
  try {
    localStorage.setItem(TABS_ANSWERED_KEY, "1");
  } catch {
    // Storage blocked: the answer holds for this visit only.
  }
}

/**
 * Browser facts the steps depend on, re-read whenever the user comes back to
 * the tab. `undefined` means still loading; `pinned: null` means the browser
 * can't tell (the pin step never blocks).
 */
function useBrowserFacts() {
  const [tabsGranted, setTabsGranted] = useState<boolean | undefined>(undefined);
  const [pinned, setPinned] = useState<boolean | null | undefined>(undefined);
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);

  const refresh = useCallback(() => {
    void hasTabsPermission().then(setTabsGranted);
    void readPinned().then(setPinned);
    void getShortcut("save-point").then(setShortcut);
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const offPinned = onPinnedChange(() => void readPinned().then(setPinned));
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      offPinned();
    };
  }, [refresh]);

  return { tabsGranted, setTabsGranted, pinned, shortcut };
}

function Welcome() {
  const { data, loadError, reload } = useOrion();
  const { tabsGranted, setTabsGranted, pinned, shortcut } = useBrowserFacts();
  const [tabsAnswered, setTabsAnswered] = useState(readTabsAnswered);
  const [openedAt] = useState(() => Date.now());
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const windowId = useRef<number | undefined>(undefined);
  const tabId = useRef<number | undefined>(undefined);
  const surfaceMode = useRef<SurfaceMode | undefined>(undefined);
  const nextStepHandled = useRef(false);
  const prevSteps = useRef<Record<StepId, StepStatus> | null>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, runSave] = useBusy();
  const [importing, runImport] = useBusy();
  const now = useNow(30_000);

  const closeToast = useCallback(() => setToast(null), []);
  const ui: Ui = useMemo(
    () => ({
      toast: (t) => setToast({ ...t, id: ++toastId.current }),
      reload,
      run: async (fn, okText) => {
        try {
          const result = await fn();
          await reload();
          if (okText) setToast({ id: ++toastId.current, kind: "info", text: okText });
          return result;
        } catch (err) {
          await reload();
          setToast({ id: ++toastId.current, kind: "error", text: errorMessage(err) });
          return undefined;
        }
      },
    }),
    [reload]
  );

  // Fetched up front so "Open the panel" can call sidePanel.open inside the click, with no await first.
  useEffect(() => {
    chrome.windows?.getCurrent?.().then(
      (w) => {
        windowId.current = w.id;
      },
      (err: unknown) => console.warn(`[${APP_NAME}] could not read the current window`, err)
    );
    // Fallback target if the click beats the window lookup.
    chrome.tabs?.getCurrent?.().then(
      (t) => {
        tabId.current = t?.id;
      },
      (err: unknown) => console.warn(`[${APP_NAME}] could not read this tab`, err)
    );
    // The service worker's choice: "window" when the side panel exists but couldn't be set up.
    chrome.storage?.session?.get(SURFACE_MODE_KEY).then(
      (got) => {
        const mode = got[SURFACE_MODE_KEY];
        if (mode === "panel" || mode === "window") surfaceMode.current = mode;
      },
      (err: unknown) => console.warn(`[${APP_NAME}] could not read the surface mode`, err)
    );
  }, []);

  const factsLoaded = tabsGranted !== undefined && pinned !== undefined && shortcut !== undefined;
  const state = useMemo(
    () =>
      data && tabsGranted !== undefined && pinned !== undefined
        ? computeWelcome({ workflows: data.workflows, meta: data.meta, tabsGranted, tabsAnswered, openedAt, pinned })
        : null,
    [data, tabsGranted, tabsAnswered, openedAt, pinned]
  );

  // Announce newly finished steps, and when a finished step's controls vanish
  // (focus falls to <body>), move focus on to the next thing to do. The first
  // snapshot waits for every fact, so facts arriving on load aren't "completions".
  useEffect(() => {
    if (!state || !factsLoaded) return;
    const prev = prevSteps.current;
    prevSteps.current = state.steps;
    if (!prev) return;
    const done = ORDER.filter((id) => state.steps[id] === "done" && prev[id] !== "done");
    if (!done.length) return;
    announce(done.map((id) => `Step ${ORDER.indexOf(id) + 1} done.`).join(" "));
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const next = document.querySelector(".wstep-current")?.querySelector<HTMLElement>("input, button") ?? openRef.current;
    next?.focus();
  }, [state, factsLoaded]);

  // Clear first, then set a moment later, so the same words are read again.
  // A timer, not requestAnimationFrame: frames stall in a hidden or unpainted tab.
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function announce(text: string) {
    clearTimeout(announceTimer.current);
    setAnnouncement("");
    announceTimer.current = setTimeout(() => setAnnouncement(text), 50);
  }
  useEffect(() => () => clearTimeout(announceTimer.current), []);

  // The shortcut's save point on this page carries no next step: attach the typed one, once.
  // A save point that already has one (the capture box on another tab, or an edit in the
  // panel) is newer than the draft, so it wins and the draft is dropped.
  const savedSinceOpen = state?.savedSinceOpen ?? false;
  const lastSinceOpen = state?.lastSinceOpen ?? null;
  const active = state?.active ?? null;
  useEffect(() => {
    if (!lastSinceOpen || !active || nextStepHandled.current) return;
    nextStepHandled.current = true;
    if (lastSinceOpen.nextStep || !draft.trim()) return;
    void ui.run(() => attachNextStep(active.workflow.id, active.task.id, draft));
  }, [lastSinceOpen, active, draft, ui]);

  function saveNow() {
    if (!active) return;
    const { workflow, task } = active;
    void runSave(async () => {
      // This save carries the next step itself; the shortcut path must not add it again.
      nextStepHandled.current = true;
      const ok = await ui.run(async () => {
        await saveFromWelcome(workflow.id, task.id, task.title, draft);
        return true;
      });
      if (!ok) nextStepHandled.current = false;
    });
  }

  function turnOnTabs() {
    // Straight from the click: the permission prompt needs the user gesture.
    void requestTabsPermission().then((granted) => {
      setTabsGranted(granted);
      answerTabs();
    });
  }

  function answerTabs() {
    setTabsAnswered(true);
    writeTabsAnswered();
  }

  function openPanelWindow() {
    const msg: ExtensionMessage = { type: "ORION_OPEN_PANEL_WINDOW" };
    chrome.runtime.sendMessage(msg).then(
      (r: { ok?: boolean } | undefined) => {
        if (r?.ok === false) ui.toast({ kind: "error", text: "Couldn't open the panel. Try Alt+Shift+O." });
      },
      (err: unknown) => {
        console.error(`[${APP_NAME}] open panel window failed`, err);
        ui.toast({ kind: "error", text: "Couldn't open the panel. Try Alt+Shift+O." });
      }
    );
  }

  function openPanel() {
    // No await before sidePanel.open: it must run inside the click's user gesture.
    const target = windowId.current !== undefined ? { windowId: windowId.current } : tabId.current !== undefined ? { tabId: tabId.current } : null;
    if (typeof chrome.sidePanel?.open !== "function" || surfaceMode.current === "window" || !target) {
      openPanelWindow();
      return;
    }
    try {
      chrome.sidePanel.open(target).catch((err: unknown) => {
        console.warn(`[${APP_NAME}] sidePanel.open failed, opening the panel window`, err);
        openPanelWindow();
      });
    } catch (err) {
      console.warn(`[${APP_NAME}] sidePanel.open threw, opening the panel window`, err);
      openPanelWindow();
    }
  }

  async function doImport(file: File) {
    const r = await ui.run(() => importBackupFile(file));
    if (r) ui.toast({ kind: "info", text: `Imported ${countLabel(r.imported, "workflow")}.` });
  }

  if (loadError) {
    return (
      <div className="fatal">
        <strong>{loadError}</strong>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
  if (!data || !state || !factsLoaded) return <div className="loading" aria-busy="true" aria-label="Loading" />;

  return (
    <>
      <main className="welcome">
        <div className="wcol">
          <div className="wbrand">
            <img src={iconUrl} alt="" width={32} height={32} />
            <BrandName />
          </div>
          <h1 className="whead">Got pulled away? Pick up exactly where you left off.</h1>
          <p className="wlead">Four quick steps. Everything stays on this computer.</p>

          <ol className="wsteps">
            <TaskStep state={state} ui={ui} />
            <TabsStep
              status={state.steps.tabs}
              granted={tabsGranted === true}
              answered={tabsAnswered}
              onTurnOn={turnOnTabs}
              onNotNow={answerTabs}
            />
            <SaveStep
              status={state.steps.save}
              hasTask={active !== null}
              shortcut={shortcut}
              draft={draft}
              onDraft={setDraft}
              saving={saving}
              onSaveNow={saveNow}
              onSetShortcut={() => openShortcutSettings().catch(() => ui.toast({ kind: "error", text: "Couldn't open the shortcuts page. Try again." }))}
            />
            <PinStep status={state.steps.pin} pinned={pinned} />
          </ol>

          <button ref={openRef} className="btn btn-primary wopen" onClick={openPanel}>
            Open the panel
          </button>
          <p className="wfoot">
            Used the unpacked version before?{" "}
            <button className="link-btn" aria-busy={importing || undefined} onClick={() => fileRef.current?.click()}>
              Import a backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void runImport(() => doImport(f));
              }}
            />
          </p>
        </div>

        <aside className="wcol-card" aria-labelledby="card-label">
          <h2 id="card-label" className="wcard-label">
            This is what you'll come back to
          </h2>
          <div className="wcard">
            {active ? (
              <ResumeCard
                preview
                workflow={active.workflow}
                task={active.task}
                isActive
                meta={data.meta}
                live={data.live}
                now={now}
                ui={ui}
                onResume={noop}
                onFocus={noop}
              />
            ) : (
              <section className="now now-welcome wplaceholder" aria-label="No save point yet">
                <div className="now-top">
                  <span className="now-label">
                    <span className="now-mark" aria-hidden="true" />
                    No save point yet
                  </span>
                </div>
                <span className="wghost wghost-1" aria-hidden="true" />
                <span className="wghost wghost-2" aria-hidden="true" />
                <span className="wghost wghost-3" aria-hidden="true" />
              </section>
            )}
          </div>
          {savedSinceOpen && <p className="wcard-after">Next time you're pulled away, this card is waiting.</p>}
        </aside>
      </main>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <Toast toast={toast} onClose={closeToast} />
    </>
  );
}

export default function WelcomeApp() {
  return (
    <ErrorBoundary>
      <MotionRoot>
        <Welcome />
      </MotionRoot>
    </ErrorBoundary>
  );
}

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MotionRoot, Screen } from "./components/Motion";
import { Toast } from "./components/Toast";
import { WorkflowSelector } from "./components/WorkflowSelector";
import { CreateWorkflowForm } from "./components/CreateWorkflowForm";
import { WorkflowView } from "./components/WorkflowView";
import { Settings } from "./components/Settings";
import { useNow, useOrion } from "./hooks/useOrion";
import { useUi } from "./hooks/useUi";

type View = { name: "home" } | { name: "create" } | { name: "settings" } | { name: "workflow"; id: string };

function App() {
  const { data, loadError, reload } = useOrion();
  const [view, setView] = useState<View | null>(null);
  // The first screen appears in place; focus only follows screens the user opened.
  const [navigated, setNavigated] = useState(false);
  const go = useCallback((next: View) => {
    setNavigated(true);
    setView(next);
  }, []);
  const { ui, toast, closeToast } = useUi(reload);
  const now = useNow(30_000);

  // First load: open the active workflow directly, it's what you came back for.
  useEffect(() => {
    if (view || !data) return;
    const active = data.meta.activeWorkflowId;
    setView(active && data.workflows.some((w) => w.id === active) ? { name: "workflow", id: active } : { name: "home" });
  }, [data, view]);

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

  if (!data || !view) {
    return <div className="loading" aria-busy="true" aria-label="Loading" />;
  }

  const current = view.name === "workflow" ? data.workflows.find((w) => w.id === view.id) : undefined;
  const screenKey = view.name === "workflow" ? `workflow:${view.id}` : view.name;

  return (
    <div className="panel">
      <main className="panel-body">
        {/* popLayout: the next screen mounts at once (autoFocus fields work
            immediately) while the old one fades out on top, out of the flow. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <Screen key={screenKey} focusOnEnter={navigated}>
            {view.name === "home" && (
              <WorkflowSelector
                workflows={data.workflows}
                meta={data.meta}
                now={now}
                onOpen={(id) => go({ name: "workflow", id })}
                onCreate={() => go({ name: "create" })}
                onSettings={() => go({ name: "settings" })}
              />
            )}
            {view.name === "create" && (
              <CreateWorkflowForm ui={ui} onCreated={(id) => go({ name: "workflow", id })} onCancel={() => go({ name: "home" })} />
            )}
            {view.name === "settings" && <Settings workflows={data.workflows} ui={ui} onBack={() => go({ name: "home" })} />}
            {view.name === "workflow" &&
              (current ? (
                <WorkflowView workflow={current} meta={data.meta} live={data.live} ui={ui} onBack={() => go({ name: "home" })} />
              ) : (
                <div className="empty">
                  <p>That workflow no longer exists.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => go({ name: "home" })}>
                    Back to workflows
                  </button>
                </div>
              ))}
          </Screen>
        </AnimatePresence>
      </main>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <MotionRoot>
        <App />
      </MotionRoot>
    </ErrorBoundary>
  );
}

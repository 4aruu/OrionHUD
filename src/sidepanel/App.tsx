import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toast, type ToastState } from "./components/Toast";
import { WorkflowSelector } from "./components/WorkflowSelector";
import { CreateWorkflowForm } from "./components/CreateWorkflowForm";
import { WorkflowView } from "./components/WorkflowView";
import { Settings } from "./components/Settings";
import { useNow, useOrion } from "./hooks/useOrion";
import { errorMessage } from "./lib/format";
import type { Ui } from "./lib/ui";

type View = { name: "home" } | { name: "create" } | { name: "settings" } | { name: "workflow"; id: string };

function App() {
  const { data, loadError, reload } = useOrion();
  const [view, setView] = useState<View | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const now = useNow(30_000);

  // First load: open the active workflow directly, it's what you came back for.
  useEffect(() => {
    if (view || !data) return;
    const active = data.meta.activeWorkflowId;
    setView(active && data.workflows.some((w) => w.id === active) ? { name: "workflow", id: active } : { name: "home" });
  }, [data, view]);

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

  return (
    <div className="panel">
      <main className="panel-body">
        {view.name === "home" && (
          <WorkflowSelector
            workflows={data.workflows}
            meta={data.meta}
            now={now}
            onOpen={(id) => setView({ name: "workflow", id })}
            onCreate={() => setView({ name: "create" })}
            onSettings={() => setView({ name: "settings" })}
          />
        )}
        {view.name === "create" && (
          <CreateWorkflowForm ui={ui} onCreated={(id) => setView({ name: "workflow", id })} onCancel={() => setView({ name: "home" })} />
        )}
        {view.name === "settings" && <Settings workflows={data.workflows} ui={ui} onBack={() => setView({ name: "home" })} />}
        {view.name === "workflow" &&
          (current ? (
            <WorkflowView key={current.id} workflow={current} meta={data.meta} live={data.live} ui={ui} onBack={() => setView({ name: "home" })} />
          ) : (
            <div className="empty">
              <p>That workflow no longer exists.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setView({ name: "home" })}>
                Back to workflows
              </button>
            </div>
          ))}
      </main>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

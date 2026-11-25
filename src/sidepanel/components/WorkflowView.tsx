import { useEffect, useState } from "react";
import type { IAppMeta, ILiveTabs, ITaskNode, IWorkflowState } from "../../shared/types";
import { findTaskNode, leafProgress, walk } from "../../shared/taskTree";
import { startWorkflow, stopWorkflow, switchTask } from "../../shared/workflowActions";
import { captureTabs } from "../../platform/tabs";
import { categoryOf } from "../lib/categories";
import type { Ui } from "../lib/ui";
import { useNow } from "../hooks/useOrion";
import { ResumeCard } from "./ResumeCard";
import { Outline } from "./Outline";
import { TaskInspector } from "./TaskInspector";
import { InboxPanel } from "./InboxPanel";
import { SwitchPrompt } from "./SwitchPrompt";
import { ShortcutHelp } from "./ShortcutHelp";
import { BrandName } from "./BrandName";
import { completeWithFeedback } from "../lib/complete";

interface Props {
  workflow: IWorkflowState;
  meta: IAppMeta;
  live: ILiveTabs | null;
  ui: Ui;
  onBack: () => void;
}

/** Task with the newest save point: what to offer when nothing is active. */
function lastTouched(roots: ITaskNode[]): ITaskNode | null {
  let best: ITaskNode | null = null;
  walk(roots, (n) => {
    const t = n.savePoints[0]?.createdAt ?? -1;
    if (n.status !== "DONE" && t >= 0 && (!best || t > (best.savePoints[0]?.createdAt ?? -1))) best = n;
  });
  return best;
}

type Pending = { toId: string | null };

export function WorkflowView({ workflow, meta, live, ui, onBack }: Props) {
  const isActiveWorkflow = meta.activeWorkflowId === workflow.id;
  const activeId = isActiveWorkflow ? meta.currentActiveNodeId : null;
  const activeTask = activeId ? (findTaskNode(workflow.rootNodes, activeId) ?? null) : null;
  const resumeTask = activeTask ?? lastTouched(workflow.rootNodes);

  const [focusedId, setFocusedId] = useState<string | null>(activeId ?? workflow.rootNodes[0]?.id ?? null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [help, setHelp] = useState(false);
  const [drawer, setDrawer] = useState<"notes" | "inbox" | null>(null);
  const now = useNow(1000, Boolean(activeTask?.allocatedTimeMs));
  const focused = focusedId ? findTaskNode(workflow.rootNodes, focusedId) : undefined;

  // Panel-level keys: "?" anywhere, and arrow keys bring focus back to the
  // task list when it was lost (e.g. after clicking a toast button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && (t === document.body || t === null)) {
        e.preventDefault();
        document.querySelector<HTMLElement>(".tree")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress = leafProgress(workflow.rootNodes);
  const cat = categoryOf(workflow.category);
  const toggleDrawer = (d: "notes" | "inbox") => setDrawer((cur) => (cur === d ? null : d));

  function requestSwitch(toId: string | null) {
    if (activeTask && activeTask.id !== toId) setPending({ toId });
    else if (toId) void ui.run(() => startWorkflow(workflow.id, toId));
  }

  async function confirmSwitch(nextStep: string) {
    if (!pending || !activeTask) return;
    const { toId } = pending;
    setPending(null);
    await ui.run(async () => {
      const tabs = await captureTabs(activeTask.title);
      if (toId) await switchTask(workflow.id, toId, { trigger: "switch", nextStep, ...tabs });
      else await stopWorkflow({ trigger: "stop", nextStep, ...tabs });
    }, toId ? "Saved where you were." : "Paused. Your save point is ready when you come back.");
    if (toId) setFocusedId(toId);
  }

  return (
    <div className="workflow">
      <header className="wf-head">
        <button className="icon-btn" aria-label="All workflows" data-tip="All workflows" data-tip-align="start" onClick={onBack}>
          ←
        </button>
        <div className="wf-title">
          <div className="wf-cat">{cat?.label ?? "Workflow"}</div>
          <h2>{workflow.name}</h2>
        </div>
        <button className="icon-btn" aria-label="Keyboard shortcuts" data-tip="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>
          ?
        </button>
      </header>

      {pending && activeTask && (
        <SwitchPrompt
          leavingTitle={activeTask.title}
          targetTitle={pending.toId ? (findTaskNode(workflow.rootNodes, pending.toId)?.title ?? null) : null}
          onConfirm={(s) => void confirmSwitch(s)}
          onCancel={() => setPending(null)}
        />
      )}

      {resumeTask && !pending && (
        <ResumeCard
          workflow={workflow}
          task={resumeTask}
          isActive={resumeTask.id === activeId}
          meta={meta}
          live={live}
          now={now}
          ui={ui}
          onResume={(id) => requestSwitch(id)}
          onFocus={setFocusedId}
          onPause={() => requestSwitch(null)}
          onDone={() => void completeWithFeedback({ workflow, node: resumeTask, activeId, ui, onStart: requestSwitch })}
        />
      )}

      {!activeTask && !resumeTask && workflow.rootNodes.length > 0 && (
        <p className="hint-bar">
          Hover a task and press ▶ (or select it and press <kbd>.</kbd>) to start. <BrandName /> saves your place whenever you switch or step away.
        </p>
      )}

      <div className="plan-head">
        <h3 className="section-label">Plan</h3>
        {progress.total > 0 && (
          <span className="plan-count" aria-label={`${progress.done} of ${progress.total} tasks done`}>
            {progress.done} of {progress.total} done
          </span>
        )}
      </div>
      <Outline
        workflow={workflow}
        activeId={activeId}
        focusedId={focusedId}
        setFocusedId={setFocusedId}
        ui={ui}
        onSwitch={requestSwitch}
        onHelp={() => setHelp(true)}
      />

      <nav className="drawer-tabs" aria-label="Notes and inbox">
        {focused && (
          <button className="drawer-tab" aria-expanded={drawer === "notes"} aria-controls="drawer-notes" onClick={() => toggleDrawer("notes")}>
            Notes <span className="drawer-n">{focused.microNotes.length}</span>
          </button>
        )}
        <button className="drawer-tab" aria-expanded={drawer === "inbox"} aria-controls="drawer-inbox" onClick={() => toggleDrawer("inbox")}>
          Inbox <span className="drawer-n">{workflow.inbox.length}</span>
        </button>
      </nav>

      {drawer === "notes" && focused && (
        <div id="drawer-notes" className="drawer">
          <p className="drawer-for">
            For <strong>{focused.title}</strong>. Pick another task in the plan to see its notes.
          </p>
          <TaskInspector key={focused.id} workflow={workflow} task={focused} now={now} ui={ui} />
        </div>
      )}
      {drawer === "inbox" && (
        <div id="drawer-inbox" className="drawer">
          <InboxPanel workflow={workflow} focusedId={focusedId} activeId={activeId} now={now} ui={ui} />
        </div>
      )}

      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

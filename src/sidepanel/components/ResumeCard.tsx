import { useState } from "react";
import type { IAppMeta, ILiveTabs, ITaskNode, IWorkflowState } from "../../shared/types";
import { findPath, leafProgress } from "../../shared/taskTree";
import { latestNextStep, latestTabs, shouldShowResume } from "../../shared/savePoints";
import { markResumeShown, recordSavePoint } from "../../shared/workflowActions";
import { validateNextStep } from "../../shared/validators";
import { restoreTabs } from "../../platform/tabs";
import { clearResumeBadge, copyBrief, type Ui } from "../lib/ui";
import { countLabel } from "../lib/format";
import { formatAgo, formatCountdown } from "../lib/format";

interface Props {
  workflow: IWorkflowState;
  task: ITaskNode;
  isActive: boolean;
  meta: IAppMeta;
  live: ILiveTabs | null;
  now: number;
  ui: Ui;
  onResume: (taskId: string) => void;
  onFocus: (taskId: string) => void;
}

const TRIGGER_TEXT: Record<string, string> = {
  idle: "when you stepped away",
  stop: "when you paused",
  restart: "before the browser closed",
  switch: "when you switched tasks",
  manual: "with a manual save",
  complete: "when you finished",
};

export function ResumeCard({ workflow, task, isActive, meta, live, now, ui, onResume, onFocus }: Props) {
  const latest = task.savePoints[0] ?? null;
  const welcome = shouldShowResume({ latest, lastResumeShownAt: meta.lastResumeShownAt, now });
  const nextStep = latestNextStep(task.savePoints);
  const liveIsNewer = live && live.taskId === task.id && live.updatedAt > (latest?.createdAt ?? 0);
  const tabs = liveIsNewer ? live.tabs : latestTabs(task.savePoints);
  const aiTabs = tabs.filter((t) => t.kind === "ai-thread");
  const path = findPath(workflow.rootNodes, task.id);
  const progress = leafProgress([task]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!welcome && !isActive) return null;

  const remaining =
    isActive && task.allocatedTimeMs && task.startedAt ? task.allocatedTimeMs - (now - task.startedAt) : null;

  async function dismiss() {
    await ui.run(() => markResumeShown());
    await clearResumeBadge();
  }

  async function saveNextStep() {
    const step = validateNextStep(draft);
    if (!step) return;
    await ui.run(() => recordSavePoint(workflow.id, task.id, { trigger: "manual", nextStep: step }), "Next step saved.");
    setEditing(false);
    setDraft("");
  }

  return (
    <section className={`resume ${welcome ? "resume-welcome" : ""}`} aria-label={welcome ? "Welcome back" : "Current task"}>
      {welcome && latest && (
        <div className="resume-eyebrow">
          Welcome back · saved {formatAgo(now - latest.createdAt)} {TRIGGER_TEXT[latest.trigger] ?? ""}
        </div>
      )}
      <button className="crumbs" onClick={() => onFocus(task.id)} title="Show in outline">
        {path.map((n, i) => (
          <span key={n.id} className={i === path.length - 1 ? "crumb crumb-current" : "crumb"}>
            {n.isMilestone && <span className="flag" aria-label="milestone">⚑</span>}
            {n.title}
          </span>
        ))}
      </button>

      <div className="next-step">
        <span className="next-label">Next step</span>
        {editing ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveNextStep();
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={280}
              aria-label="Next step"
              placeholder="What will you do first when you're back?"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={!draft.trim()}>
              Save
            </button>
          </form>
        ) : (
          <button
            className={`next-text ${nextStep ? "" : "next-empty"}`}
            onClick={() => {
              setDraft(nextStep ?? "");
              setEditing(true);
            }}
          >
            {nextStep ?? "Add the one thing to do next"}
          </button>
        )}
      </div>

      <div className="resume-meta">
        {task.subTasks.length > 0 && (
          <span>
            {progress.done}/{progress.total} subtasks
          </span>
        )}
        {task.microNotes.some((n) => n.kind === "decision") && (
          <span>{countLabel(task.microNotes.filter((n) => n.kind === "decision").length, "decision")}</span>
        )}
        {aiTabs.length > 0 && <span>{[...new Set(aiTabs.map((t) => t.vendor))].join(", ")} thread{aiTabs.length > 1 ? "s" : ""}</span>}
        {remaining !== null && (
          <span className={remaining < 0 ? "timer timer-over" : "timer"}>
            {remaining < 0 ? `${formatCountdown(-remaining)} over` : `${formatCountdown(remaining)} left`}
          </span>
        )}
      </div>

      {welcome && tabs.length > 0 && (
        <ul className="tab-list">
          {tabs.slice(0, 5).map((t) => (
            <li key={t.url} title={t.url}>
              {t.vendor ? <span className="chip chip-ai">{t.vendor}</span> : <span className="chip">page</span>}
              <span className="tab-title">{t.title}</span>
            </li>
          ))}
          {tabs.length > 5 && <li className="muted">+{tabs.length - 5} more</li>}
        </ul>
      )}

      <div className="resume-actions">
        {!isActive && (
          <button className="btn btn-primary btn-sm" onClick={() => onResume(task.id)}>
            Resume task
          </button>
        )}
        {tabs.length > 0 && (
          <button
            className={`btn btn-sm ${isActive ? "btn-ghost" : "btn-ghost"}`}
            onClick={() =>
              void ui.run(async () => {
                const n = await restoreTabs(tabs, task.title);
                await markResumeShown();
                await clearResumeBadge();
                return n;
              }, `Reopened ${tabs.length} tab${tabs.length === 1 ? "" : "s"} as a group.`)
            }
          >
            Reopen {tabs.length} tab{tabs.length === 1 ? "" : "s"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => void copyBrief(workflow, task.id, ui)}>
          Copy brief
        </button>
        {welcome && (
          <button className="btn btn-ghost btn-sm" onClick={() => void dismiss()}>
            Got it
          </button>
        )}
      </div>
    </section>
  );
}

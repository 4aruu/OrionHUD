import { useState } from "react";
import type { IAppMeta, ILiveTabs, ITaskNode, IWorkflowState } from "../../shared/types";
import { findPath, leafProgress } from "../../shared/taskTree";
import { latestNextStep, latestTabs, shouldShowResume } from "../../shared/savePoints";
import { markResumeShown, recordSavePoint } from "../../shared/workflowActions";
import { validateNextStep } from "../../shared/validators";
import { restoreTabs } from "../../platform/tabs";
import { clearResumeBadge, copyBrief, type Ui } from "../lib/ui";
import { countLabel, formatAgo, formatCountdown } from "../lib/format";

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
  /** Shown on the strip while the task is active. */
  onPause?: () => void;
  /** Shown on the strip while the task is active. */
  onDone?: () => void;
}

const TRIGGER_TEXT: Record<string, string> = {
  idle: "when you stepped away",
  stop: "when you paused",
  restart: "before the browser closed",
  switch: "when you switched tasks",
  manual: "with a manual save",
  complete: "when you finished",
};

/**
 * The "Now" strip pinned above the plan: the task you're on, the one next
 * step, and what you can do with it. After a break it becomes "Where you
 * left off" with a Resume button instead.
 */
export function ResumeCard({ workflow, task, isActive, meta, live, now, ui, onResume, onFocus, onPause, onDone }: Props) {
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
  const [hint, setHint] = useState<string | null>(null);

  if (!welcome && !isActive) return null;

  const remaining =
    isActive && task.allocatedTimeMs && task.startedAt ? task.allocatedTimeMs - (now - task.startedAt) : null;

  async function dismiss() {
    await ui.run(() => markResumeShown());
    await clearResumeBadge();
  }

  async function saveNextStep() {
    const step = validateNextStep(draft);
    if (!step) {
      setHint("Type the one thing you'll do next, or press Esc to cancel.");
      return;
    }
    setHint(null);
    await ui.run(() => recordSavePoint(workflow.id, task.id, { trigger: "manual", nextStep: step }), "Next step saved.");
    setEditing(false);
    setDraft("");
  }

  const parents = path.slice(0, -1);
  const aiVendors = [...new Set(aiTabs.map((t) => t.vendor).filter(Boolean))];

  return (
    <section className={`now ${isActive ? "now-active" : "now-welcome"}`} aria-label={welcome ? "Welcome back" : "Current task"}>
      <div className="now-top">
        <span className="now-label">
          <span className="now-mark" aria-hidden="true" />
          {isActive ? "Now" : "Where you left off"}
        </span>
        {remaining !== null && (
          <span className={`now-timer ${remaining < 0 ? "now-over" : ""}`}>
            {remaining < 0 ? `Timebox ended ${formatAgo(-remaining)}` : `${formatCountdown(remaining)} left`}
          </span>
        )}
      </div>

      <button className="now-title" onClick={() => onFocus(task.id)} aria-label={`${task.title}: show in plan`}>
        {task.isMilestone && <span className="flag" aria-label="milestone">⚑ </span>}
        {task.title}
      </button>
      {parents.length > 0 && <p className="now-path">in {parents.map((n) => n.title).join(" › ")}</p>}

      <div className="next-step">
        <span className="field-label">Next step</span>
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
              placeholder="e.g. Run the failing test again"
              aria-invalid={hint ? true : undefined}
              aria-describedby={hint ? "next-step-hint" : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                setHint(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                setEditing(false);
                setHint(null);
              }}
            />
            <button className="btn btn-primary btn-sm" type="submit">
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
        {editing && hint && (
          <p id="next-step-hint" className="error" role="alert">
            {hint}
          </p>
        )}
      </div>

      <div className="now-actions">
        {isActive ? (
          <>
            {onDone && (
              <button className="btn btn-primary btn-sm" onClick={onDone}>
                Mark done
              </button>
            )}
            {onPause && (
              <button className="btn btn-ghost btn-sm" onClick={onPause}>
                Pause
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => onResume(task.id)}>
            Resume task
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => void copyBrief(workflow, task.id, ui)}>
          Copy brief
        </button>
      </div>

      {(task.subTasks.length > 0 || tabs.length > 0 || (welcome && latest)) && (
        <p className="now-meta">
          {welcome && latest && (
            <span>
              Saved {formatAgo(now - latest.createdAt)} {TRIGGER_TEXT[latest.trigger] ?? ""}
            </span>
          )}
          {task.subTasks.length > 0 && (
            <span>
              {progress.done} of {countLabel(progress.total, "subtask")} done
            </span>
          )}
          {tabs.length > 0 && (
            <button
              className="link-btn"
              onClick={() =>
                void ui.run(async () => {
                  const n = await restoreTabs(tabs, task.title);
                  await markResumeShown();
                  await clearResumeBadge();
                  return n;
                }, `Reopened ${countLabel(tabs.length, "tab")} as a group.`)
              }
            >
              Reopen {countLabel(tabs.length, "tab")}
              {aiVendors.length ? `, incl. ${aiVendors.join(" and ")}` : ""}
            </button>
          )}
          {welcome && (
            <button className="link-btn" onClick={() => void dismiss()}>
              Dismiss
            </button>
          )}
        </p>
      )}
    </section>
  );
}

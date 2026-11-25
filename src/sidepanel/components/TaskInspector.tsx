import { useId, useState } from "react";
import type { ITaskNode, IWorkflowState } from "../../shared/types";
import { addNote, deleteNote, restoreNote, setTaskTimer, toggleMilestone } from "../../shared/workflowActions";
import { restoreTabs } from "../../platform/tabs";
import { copyBrief, type Ui } from "../lib/ui";
import { formatAgo, formatMinutes } from "../lib/format";

const TIMEBOXES = [0, 15, 25, 45, 60, 90];

const TRIGGER_LABEL: Record<string, string> = {
  switch: "Switched away",
  idle: "Stepped away",
  manual: "Saved",
  stop: "Paused",
  complete: "Completed",
  restart: "Browser restarted",
};

export function TaskInspector({ workflow, task, now, ui }: { workflow: IWorkflowState; task: ITaskNode; now: number; ui: Ui }) {
  const [text, setText] = useState("");
  const [asDecision, setAsDecision] = useState(false);
  const decisions = task.microNotes.filter((n) => n.kind === "decision").reverse();
  const notes = task.microNotes.filter((n) => n.kind === "note").reverse();

  const inputId = useId();

  /** Deletes now, offers Undo in the toast. */
  async function remove(noteId: string, kind: "note" | "decision") {
    const removed = await ui.run(() => deleteNote(workflow.id, task.id, noteId));
    if (!removed) return;
    ui.toast({
      kind: "info",
      text: kind === "decision" ? "Decision deleted." : "Note deleted.",
      action: { label: "Undo", run: () => void ui.run(() => restoreNote(workflow.id, removed)) },
    });
  }

  async function submit() {
    const value = text.trim();
    if (!value) return;
    const ok = await ui.run(() => addNote(workflow.id, task.id, value, asDecision ? "decision" : "note"));
    if (ok) setText("");
  }

  return (
    <section className="inspector" aria-label={`Details for ${task.title}`}>
      <header className="inspector-head">
        <div className="inspector-tools">
          <label className="select-label">
            <span className="sr-only">Timebox</span>
            <select
              value={task.allocatedTimeMs ? Math.round(task.allocatedTimeMs / 60_000) : 0}
              onChange={(e) => void ui.run(() => setTaskTimer(workflow.id, task.id, Number(e.target.value) || null))}
              aria-label="Timebox"
            >
              {TIMEBOXES.map((m) => (
                <option key={m} value={m}>
                  {m ? `⏱ ${m} min` : "No timebox"}
                </option>
              ))}
              {task.allocatedTimeMs && !TIMEBOXES.includes(Math.round(task.allocatedTimeMs / 60_000)) && (
                <option value={Math.round(task.allocatedTimeMs / 60_000)}>⏱ {formatMinutes(task.allocatedTimeMs)}</option>
              )}
            </select>
          </label>
          <button className={`btn btn-ghost btn-sm ${task.isMilestone ? "btn-on" : ""}`} aria-pressed={task.isMilestone} onClick={() => void ui.run(() => toggleMilestone(workflow.id, task.id))}>
            ⚑ Milestone
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void copyBrief(workflow, task.id, ui)}>
            Copy brief
          </button>
        </div>
      </header>

      <form
        className="note-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field-label" htmlFor={inputId}>
          {asDecision ? "Add a decision" : "Add a note"}
        </label>
        <input
          id={inputId}
          value={text}
          maxLength={500}
          placeholder={asDecision ? "Why, not just what. Enter to save" : "A command, link or reminder. Enter to save"}
          aria-label="Note"
          onChange={(e) => setText(e.target.value)}
        />
        <label className="toggle">
          <input type="checkbox" checked={asDecision} onChange={(e) => setAsDecision(e.target.checked)} />
          Decision
        </label>
      </form>

      {decisions.length > 0 && (
        <div className="log">
          <h4>Decisions</h4>
          <ul>
            {decisions.map((d) => (
              <li key={d.id} className="log-item log-decision">
                <span>{d.content}</span>
                {d.sourceUrl && (
                  <a href={d.sourceUrl} target="_blank" rel="noreferrer noopener" className="log-src" title={d.sourceUrl}>
                    source
                  </a>
                )}
                <button className="icon-btn" aria-label="Delete decision" data-tip="Delete decision" onClick={() => void remove(d.id, "decision")}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="log">
          <h4>Notes</h4>
          <ul>
            {notes.slice(0, 20).map((n) => (
              <li key={n.id} className={`log-item ${n.isActionableCommand ? "log-cmd" : ""}`}>
                <span>{n.content}</span>
                <span className="muted small">{formatAgo(now - n.timestamp)}</span>
                <button className="icon-btn" aria-label="Delete note" data-tip="Delete note" onClick={() => void remove(n.id, "note")}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.savePoints.length > 0 && (
        <div className="log">
          <h4>Save points</h4>
          <ol className="timeline">
            {task.savePoints.slice(0, 5).map((s) => (
              <li key={s.id}>
                <div className="timeline-head">
                  <span>{TRIGGER_LABEL[s.trigger] ?? "Saved"}</span>
                  <span className="muted small">{formatAgo(now - s.createdAt)}</span>
                </div>
                {s.nextStep && <div className="timeline-step">→ {s.nextStep}</div>}
                {s.tabs.length > 0 && (
                  <button className="link-btn" onClick={() => void ui.run(() => restoreTabs(s.tabs, task.title), `Reopened ${s.tabs.length} tabs.`)}>
                    Reopen {s.tabs.length} tab{s.tabs.length === 1 ? "" : "s"}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

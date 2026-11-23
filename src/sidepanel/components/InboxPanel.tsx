import { useState } from "react";
import type { IWorkflowState } from "../../shared/types";
import { addInboxItem, dismissInboxItem, promoteInboxItem } from "../../shared/workflowActions";
import { findTaskNode } from "../../shared/taskTree";
import type { Ui } from "../lib/ui";
import { formatAgo } from "../lib/format";

interface Props {
  workflow: IWorkflowState;
  focusedId: string | null;
  activeId: string | null;
  now: number;
  ui: Ui;
}

export function InboxPanel({ workflow, focusedId, activeId, now, ui }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(workflow.inbox.length > 0);
  const target = focusedId ? findTaskNode(workflow.rootNodes, focusedId) : undefined;

  return (
    <section className="inbox">
      <button className="section-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`caret ${open ? "caret-open" : ""}`}>▸</span>
        Inbox
        {workflow.inbox.length > 0 && <span className="count">{workflow.inbox.length}</span>}
        <span className="muted small hint-right">Alt+Shift+Q from any page</span>
      </button>
      {open && (
        <>
          <form
            className="note-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim();
              if (!v) return;
              void ui.run(() => addInboxItem(workflow.id, v, activeId)).then((r) => r && setText(""));
            }}
          >
            <input value={text} maxLength={500} placeholder="Park a side quest without losing focus" aria-label="Inbox item" onChange={(e) => setText(e.target.value)} />
          </form>
          {workflow.inbox.length === 0 ? (
            <p className="muted small pad">Nothing parked. Thoughts that pop up mid-task land here.</p>
          ) : (
            <ul className="inbox-list">
              {workflow.inbox.map((item) => (
                <li key={item.id}>
                  <div className="inbox-text">{item.text}</div>
                  <div className="inbox-meta">
                    <span className="muted small">{formatAgo(now - item.createdAt)}</span>
                    {item.sourceUrl && (
                      <a className="log-src" href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
                        source
                      </a>
                    )}
                    <span className="spacer" />
                    {target && (
                      <button
                        className="btn btn-ghost btn-xs"
                        title={`Add under “${target.title}”`}
                        onClick={() => void ui.run(() => promoteInboxItem(workflow.id, item.id, target.id), `Added under “${target.title}”.`)}
                      >
                        → Subtask
                      </button>
                    )}
                    <button className="btn btn-ghost btn-xs" onClick={() => void ui.run(() => promoteInboxItem(workflow.id, item.id, null), "Added as a task.")}>
                      → Task
                    </button>
                    <button className="icon-btn" aria-label="Dismiss inbox item" onClick={() => void ui.run(() => dismissInboxItem(workflow.id, item.id))}>
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

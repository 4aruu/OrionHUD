import { useId, useState } from "react";
import type { IWorkflowState } from "../../shared/types";
import { addInboxItem, dismissInboxItem, promoteInboxItem, restoreInboxItem } from "../../shared/workflowActions";
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
  const target = focusedId ? findTaskNode(workflow.rootNodes, focusedId) : undefined;
  const inputId = useId();

  async function dismiss(itemId: string) {
    const removed = await ui.run(() => dismissInboxItem(workflow.id, itemId));
    if (!removed) return;
    ui.toast({ kind: "info", text: "Inbox item dismissed.", action: { label: "Undo", run: () => void ui.run(() => restoreInboxItem(workflow.id, removed)) } });
  }

  return (
    <section className="inbox" aria-label="Inbox">
          <p className="drawer-for">
            Side quests, parked so they don't pull you off task. Add from any page with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Q</kbd>.
          </p>
          <form
            className="note-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim();
              if (!v) return;
              void ui.run(() => addInboxItem(workflow.id, v, activeId)).then((r) => r && setText(""));
            }}
          >
            <label className="field-label" htmlFor={inputId}>
              Park a side quest
            </label>
            <input
              id={inputId}
              value={text}
              maxLength={500}
              placeholder="Check rate limits on /token. Enter to save"
              aria-label="Inbox item"
              onChange={(e) => setText(e.target.value)}
            />
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
                        Add as subtask
                      </button>
                    )}
                    <button className="btn btn-ghost btn-xs" onClick={() => void ui.run(() => promoteInboxItem(workflow.id, item.id, null), "Added as a task.")}>
                      Add as task
                    </button>
                    <button className="icon-btn" aria-label="Dismiss inbox item" data-tip="Dismiss" onClick={() => void dismiss(item.id)}>
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}

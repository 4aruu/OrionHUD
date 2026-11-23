import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ITaskNode, IWorkflowState } from "../../shared/types";
import { findTaskNode, flattenVisible, leafProgress } from "../../shared/taskTree";
import { parseOutline } from "../../shared/outline";
import {
  OrionError,
  addOutline,
  addTask,
  completeTask,
  deleteTask,
  indentTask,
  moveTask,
  outdentTask,
  renameTask,
  reopenTask,
  restoreTask,
  setCollapsed,
  toggleMilestone,
} from "../../shared/workflowActions";
import { copyBrief, type Ui } from "../lib/ui";
import { errorMessage } from "../lib/format";

type EditState =
  | { kind: "rename"; id: string }
  | { kind: "new"; parentId: string | null; index: number; anchorId: string | null; depth: number };

interface Props {
  workflow: IWorkflowState;
  activeId: string | null;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  ui: Ui;
  onSwitch: (taskId: string) => void;
  onHelp: () => void;
}

function siblingIndex(workflow: IWorkflowState, node: ITaskNode): number {
  const siblings = node.parentId ? (findTaskNode(workflow.rootNodes, node.parentId)?.subTasks ?? []) : workflow.rootNodes;
  return siblings.findIndex((s) => s.id === node.id);
}

export function Outline({ workflow, activeId, focusedId, setFocusedId, ui, onSwitch, onHelp }: Props) {
  const rows = flattenVisible(workflow.rootNodes);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [draft, setDraft] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  // Bumped whenever an edit is opened or cancelled, so an in-flight save
  // can't reopen an input the user already dismissed.
  const editGen = useRef(0);
  const committing = useRef(false);
  const focused = focusedId ? findTaskNode(workflow.rootNodes, focusedId) : undefined;

  // Follow keyboard focus, but not on first render: the panel should open at
  // the top, where the resume card is.
  // (Compared by value, so StrictMode's double effect run doesn't scroll.)
  const lastScrolled = useRef(focusedId);
  useEffect(() => {
    if (focusedId === lastScrolled.current) return;
    lastScrolled.current = focusedId;
    if (focusedId) document.getElementById(`row-${focusedId}`)?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  // If the focused task disappears (deleted elsewhere), fall back to the first row.
  useEffect(() => {
    if (focusedId && !focused) setFocusedId(rows[0]?.node.id ?? null);
  }, [focusedId, focused, rows, setFocusedId]);

  function backToTree() {
    editGen.current++;
    setEdit(null);
    setDraft("");
    requestAnimationFrame(() => treeRef.current?.focus());
  }

  function startNew(asChild: boolean) {
    editGen.current++;
    if (!focused) {
      setEdit({ kind: "new", parentId: null, index: workflow.rootNodes.length, anchorId: null, depth: 1 });
    } else if (asChild) {
      const depth = rows.find((r) => r.node.id === focused.id)?.depth ?? 1;
      setEdit({ kind: "new", parentId: focused.id, index: 0, anchorId: focused.id, depth: depth + 1 });
    } else {
      // Show the input after the focused task's visible subtree, where the new sibling will land.
      const at = rows.findIndex((r) => r.node.id === focused.id);
      const depth = rows[at]?.depth ?? 1;
      let anchor = at;
      while (rows[anchor + 1] && rows[anchor + 1]!.depth > depth) anchor++;
      setEdit({
        kind: "new",
        parentId: focused.parentId,
        index: siblingIndex(workflow, focused) + 1,
        anchorId: rows[anchor]?.node.id ?? focused.id,
        depth,
      });
    }
    setDraft("");
  }

  async function commitEdit() {
    if (!edit) return;
    const text = draft.trim();
    if (edit.kind === "rename") {
      if (text && text !== findTaskNode(workflow.rootNodes, edit.id)?.title) await ui.run(() => renameTask(workflow.id, edit.id, text));
      backToTree();
      return;
    }
    if (!text) {
      backToTree();
      return;
    }
    if (committing.current) return;
    committing.current = true;
    const gen = ++editGen.current;
    const created = await ui.run(() => addTask(workflow.id, edit.parentId, text, { index: edit.index })).finally(() => {
      committing.current = false;
    });
    if (created && gen === editGen.current) {
      setFocusedId(created.id);
      // Keep typing: the next Enter adds the following sibling.
      setEdit({ ...edit, index: edit.index + 1, anchorId: created.id });
      setDraft("");
    } else if (created) {
      setFocusedId(created.id);
    }
  }

  async function pasteOutline(text: string) {
    if (!edit || edit.kind !== "new") return;
    const items = parseOutline(text);
    if (!items.length) return;
    const ids = await ui.run(() => addOutline(workflow.id, edit.parentId, items), `Added ${items.length} task${items.length === 1 ? "" : "s"} from your outline.`);
    if (ids?.[0]) setFocusedId(ids[0]);
    backToTree();
  }

  async function toggleDone(node: ITaskNode) {
    if (node.status === "DONE") {
      await ui.run(() => reopenTask(workflow.id, node.id));
      return;
    }
    const finish = async (cascade: boolean) => {
      try {
        const r = await completeTask(workflow.id, node.id, { cascade });
        await ui.reload();
        const parent = r.parentReadyId ? findTaskNode(workflow.rootNodes, r.parentReadyId) : undefined;
        const next = r.nextTaskId ? findTaskNode(workflow.rootNodes, r.nextTaskId) : undefined;
        if (parent) {
          ui.toast({ kind: "info", text: `All of “${parent.title}” is done.`, action: { label: "Complete it", run: () => void toggleDone(parent) } });
        } else if (node.id === activeId && next) {
          ui.toast({ kind: "info", text: `Next up: ${next.title}`, action: { label: "Start", run: () => onSwitch(next.id) } });
        } else {
          ui.toast({ kind: "info", text: "Done." });
        }
      } catch (err) {
        if (err instanceof OrionError && err.code === "open-children") {
          ui.toast({ kind: "info", text: err.message, action: { label: "Complete all", run: () => void finish(true) } });
        } else {
          ui.toast({ kind: "error", text: errorMessage(err) });
        }
      }
    };
    await finish(false);
  }

  async function remove(node: ITaskNode) {
    const idx = rows.findIndex((r) => r.node.id === node.id);
    const removed = await ui.run(() => deleteTask(workflow.id, node.id));
    if (!removed) return;
    setFocusedId(rows[idx + 1]?.node.id ?? rows[idx - 1]?.node.id ?? null);
    ui.toast({
      kind: "info",
      text: `Deleted “${node.title}”${node.subTasks.length ? " and its subtasks" : ""}.`,
      action: { label: "Undo", run: () => void ui.run(() => restoreTask(workflow.id, removed)).then(() => setFocusedId(node.id)) },
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== treeRef.current) return; // inputs handle their own keys
    const idx = rows.findIndex((r) => r.node.id === focusedId);
    const node = focused;
    const key = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (key === "ArrowDown" && !e.altKey) {
      handled();
      setFocusedId(rows[Math.min(idx + 1, rows.length - 1)]?.node.id ?? null);
    } else if (key === "ArrowUp" && !e.altKey) {
      handled();
      setFocusedId(rows[Math.max(idx - 1, 0)]?.node.id ?? null);
    } else if (key === "Home") {
      handled();
      setFocusedId(rows[0]?.node.id ?? null);
    } else if (key === "End") {
      handled();
      setFocusedId(rows[rows.length - 1]?.node.id ?? null);
    } else if (key === "Enter") {
      handled();
      startNew(e.shiftKey);
    } else if (key === "?") {
      handled();
      onHelp();
    } else if (!node) {
      return;
    } else if (key === "ArrowRight") {
      handled();
      if (node.subTasks.length && node.collapsed) void ui.run(() => setCollapsed(workflow.id, node.id, false));
      else if (node.subTasks[0]) setFocusedId(node.subTasks[0].id);
    } else if (key === "ArrowLeft") {
      handled();
      if (node.subTasks.length && !node.collapsed) void ui.run(() => setCollapsed(workflow.id, node.id, true));
      else if (node.parentId) setFocusedId(node.parentId);
    } else if (key === "Tab") {
      handled();
      void ui.run(async () => {
        const ok = e.shiftKey ? await outdentTask(workflow.id, node.id) : await indentTask(workflow.id, node.id);
        if (!ok) ui.toast({ kind: "info", text: e.shiftKey ? "Already at the top level." : "Can't indent here (needs a task above, max 8 levels)." });
      });
    } else if (e.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
      handled();
      void ui.run(() => moveTask(workflow.id, node.id, key === "ArrowUp" ? -1 : 1));
    } else if (key === " ") {
      handled();
      void toggleDone(node);
    } else if (key === "e" || key === "F2") {
      handled();
      setEdit({ kind: "rename", id: node.id });
      setDraft(node.title);
    } else if (key === ".") {
      handled();
      if (node.id !== activeId) onSwitch(node.id);
    } else if (key === "m") {
      handled();
      void ui.run(() => toggleMilestone(workflow.id, node.id));
    } else if (key === "c") {
      handled();
      void copyBrief(workflow, node.id, ui);
    } else if (key === "Delete" || key === "Backspace") {
      handled();
      void remove(node);
    }
  }

  function editInput(depth: number) {
    return (
      <div className="row row-edit" style={{ paddingLeft: 10 + (depth - 1) * 16 }}>
        <span className="check" aria-hidden="true" />
        <input
          autoFocus
          className="row-input"
          value={draft}
          maxLength={200}
          placeholder={edit?.kind === "new" ? "New task · Enter to add another · paste an outline" : "Rename task"}
          aria-label={edit?.kind === "new" ? "New task title" : "Task title"}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              void pasteOutline(text);
            }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              backToTree();
            }
          }}
          onBlur={() => {
            if (edit?.kind === "rename") void commitEdit();
          }}
        />
      </div>
    );
  }

  const newAtTop = edit?.kind === "new" && edit.anchorId === null;

  return (
    <div
      ref={treeRef}
      className="tree"
      role="tree"
      aria-label={`Tasks in ${workflow.name}`}
      tabIndex={0}
      aria-activedescendant={focusedId ? `row-${focusedId}` : undefined}
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (!focusedId && rows[0]) setFocusedId(rows[0].node.id);
      }}
    >
      {rows.length === 0 && !edit && (
        <div className="empty">
          <p>No tasks yet.</p>
          <button className="btn btn-primary btn-sm" onClick={() => startNew(false)}>
            Add the first task
          </button>
          <p className="muted small">Tip: paste a bulleted plan from any AI chat to add it all at once.</p>
        </div>
      )}
      {newAtTop && edit && editInput(edit.depth)}
      {rows.map(({ node, depth }) => {
        const isFocused = node.id === focusedId;
        const isActive = node.id === activeId;
        const hasKids = node.subTasks.length > 0;
        const p = hasKids ? leafProgress([node]) : null;
        const renaming = edit?.kind === "rename" && edit.id === node.id;
        return (
          <div key={node.id}>
            {renaming ? (
              editInput(depth)
            ) : (
              <div
                id={`row-${node.id}`}
                role="treeitem"
                aria-level={depth}
                aria-selected={isFocused}
                aria-expanded={hasKids ? !node.collapsed : undefined}
                className={`row ${isFocused ? "row-focused" : ""} ${isActive ? "row-active" : ""} ${node.status === "DONE" ? "row-done" : ""}`}
                style={{ paddingLeft: 10 + (depth - 1) * 16 }}
                onClick={() => setFocusedId(node.id)}
                onDoubleClick={() => {
                  setEdit({ kind: "rename", id: node.id });
                  setDraft(node.title);
                }}
              >
                {hasKids ? (
                  <button
                    className="chevron"
                    aria-label={node.collapsed ? "Expand" : "Collapse"}
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      void ui.run(() => setCollapsed(workflow.id, node.id, !node.collapsed));
                    }}
                  >
                    {node.collapsed ? "▸" : "▾"}
                  </button>
                ) : (
                  <span className="chevron-spacer" />
                )}
                <button
                  className={`check ${node.status === "DONE" ? "check-done" : ""}`}
                  aria-label={node.status === "DONE" ? `Reopen ${node.title}` : `Complete ${node.title}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleDone(node);
                  }}
                >
                  {node.status === "DONE" ? "✓" : ""}
                </button>
                <span className="row-title">
                  {node.isMilestone && <span className="flag" aria-label="milestone">⚑ </span>}
                  {node.title}
                </span>
                {isActive && <span className="badge-now">now</span>}
                {p && (
                  <span className="row-progress" aria-label={`${p.done} of ${p.total} done`}>
                    {p.done}/{p.total}
                  </span>
                )}
                {node.savePoints[0]?.nextStep && !isActive && node.status !== "DONE" && (
                  <span className="row-dot" title={`Next step: ${node.savePoints[0].nextStep}`} aria-label="Has a saved next step" />
                )}
                <span className="row-actions">
                  {!isActive && node.status !== "DONE" && (
                    <button
                      className="icon-btn"
                      tabIndex={-1}
                      aria-label={`Work on ${node.title}`}
                      title="Work on this (.)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwitch(node.id);
                      }}
                    >
                      ▶
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    tabIndex={-1}
                    aria-label={`Add subtask to ${node.title}`}
                    title="Add subtask (Shift+Enter)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedId(node.id);
                      const d = depth + 1;
                      setEdit({ kind: "new", parentId: node.id, index: 0, anchorId: node.id, depth: d });
                      setDraft("");
                    }}
                  >
                    +
                  </button>
                </span>
              </div>
            )}
            {edit?.kind === "new" && edit.anchorId === node.id && editInput(edit.depth)}
          </div>
        );
      })}
      {rows.length > 0 && !edit && (
        <button className="add-row" onClick={() => {
          setFocusedId(null);
          setEdit({ kind: "new", parentId: null, index: workflow.rootNodes.length, anchorId: rows[rows.length - 1]!.node.id, depth: 1 });
          setDraft("");
        }}>
          + Add task
        </button>
      )}
    </div>
  );
}

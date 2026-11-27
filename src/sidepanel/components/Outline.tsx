import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence } from "motion/react";
import { Reveal } from "./Motion";
import type { ITaskNode, IWorkflowState } from "../../shared/types";
import { findPath, findTaskNode, flattenVisible, leafProgress, type VisibleRow } from "../../shared/taskTree";
import { parseOutline } from "../../shared/outline";
import {
  addOutline,
  addTask,
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
import { completeWithFeedback } from "../lib/complete";
import { elbowWidth, guideX, rowIndent, treeGuides, type RowGuides } from "../lib/treeGuides";

/** Where a row's checkbox starts, past the caret column (16px) and the 8px gap. */
const CHECK_OFFSET = 24;

/** The hairline connectors behind a row: decorative, hidden from screen readers. */
function Guides({ depth, g, hasCaret }: { depth: number; g: RowGuides; hasCaret: boolean }) {
  if (!g.elbow && !g.stem) return null;
  return (
    <span className="guides" aria-hidden="true">
      {g.rails.map((k) => (
        <span key={k} className="guide guide-rail" style={{ left: guideX(k) }} />
      ))}
      {g.elbow && <span className="guide guide-elbow" style={{ left: guideX(depth - 1), width: elbowWidth(depth, hasCaret) }} />}
      {g.more && <span className="guide guide-more" style={{ left: guideX(depth - 1) }} />}
      {g.stem && <span className="guide guide-stem" style={{ left: guideX(depth) }} />}
    </span>
  );
}

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

/** Rows of one group, minus finished tasks (and anything under them) unless they're shown. */
function visibleRows(all: VisibleRow[], showDone: boolean): VisibleRow[] {
  const out: VisibleRow[] = [];
  let skipBelow = Infinity;
  all.forEach((r, i) => {
    if (r.depth > skipBelow) return;
    skipBelow = Infinity;
    if (i > 0 && !showDone && r.node.status === "DONE") {
      skipBelow = r.depth;
      return;
    }
    out.push(r);
  });
  return out;
}

export function Outline({ workflow, activeId, focusedId, setFocusedId, ui, onSwitch, onHelp }: Props) {
  // One group per top-level task. Finished subtasks fold into a "✓ N done"
  // line, so the list shows what's left.
  const [shownDone, setShownDone] = useState<ReadonlySet<string>>(() => new Set());
  const groups = workflow.rootNodes.map((root) => {
    const all = flattenVisible([root]);
    const showing = shownDone.has(root.id);
    const shown = visibleRows(all, showing);
    return {
      root,
      showing,
      rows: shown,
      guides: treeGuides(shown.map((r) => r.depth)),
      doneCount: all.slice(1).filter((r) => r.node.status === "DONE").length,
    };
  });
  const rows = groups.flatMap((g) => g.rows);
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

  // If the focused task disappears (deleted elsewhere) fall back to the first
  // row. If it folds away: once finished, to the row now in its place; under
  // a collapsed parent, to that parent.
  const focusIndex = rows.findIndex((r) => r.node.id === focusedId);
  const lastFocusIndex = useRef(0);
  useEffect(() => {
    if (focusIndex >= 0) {
      lastFocusIndex.current = focusIndex;
      return;
    }
    if (!focusedId) return;
    if (!focused) {
      setFocusedId(rows[0]?.node.id ?? null);
      return;
    }
    const shown = new Set(rows.map((r) => r.node.id));
    const ancestor = focused.status === "DONE" ? undefined : findPath(workflow.rootNodes, focused.id).reverse().find((n) => shown.has(n.id));
    const fallback = rows[Math.min(lastFocusIndex.current, rows.length - 1)];
    setFocusedId(ancestor?.id ?? fallback?.node.id ?? null);
  }, [focusIndex, focusedId, focused, rows, setFocusedId, workflow.rootNodes]);

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
    if (node.status === "DONE") await ui.run(() => reopenTask(workflow.id, node.id));
    else await completeWithFeedback({ workflow, node, activeId, ui, onStart: onSwitch });
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

  /** The inline title input. `g` keeps the connectors of the row it replaces or joins. */
  function editInput(depth: number, g?: RowGuides) {
    return (
      <div className={`row row-edit ${depth >= 3 ? "row-deep" : ""}`} style={{ paddingLeft: rowIndent(depth) + CHECK_OFFSET }}>
        {g && <Guides depth={depth} g={g} hasCaret={false} />}
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
      {newAtTop && edit && <div className="group group-solo" role="none">{editInput(edit.depth)}</div>}
      {/* Rows and groups grow in and fold out (add, delete, complete, expand,
          collapse, show/hide done), so the plan below glides rather than jumps. */}
      <AnimatePresence initial={false}>
        {groups.map((g) => (
          <Reveal key={g.root.id} className="tree-item">
            <div className={`group ${g.root.subTasks.length ? "" : "group-solo"}`} role="none">
              <AnimatePresence initial={false}>{g.rows.map((r, i) => renderRow(r, g.guides[i]!))}</AnimatePresence>
              {g.doneCount > 0 && (
                <button
                  className="done-fold"
                  aria-expanded={g.showing}
                  aria-label={`${g.showing ? "Hide" : "Show"} ${g.doneCount} done in ${g.root.title}`}
                  onClick={() =>
                    setShownDone((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(g.root.id)) next.add(g.root.id);
                      return next;
                    })
                  }
                >
                  <span>✓ {g.doneCount} done</span>
                  <span className="done-fold-act">{g.showing ? "Hide" : "Show"}</span>
                </button>
              )}
            </div>
            {/* The new-task input rides inside the group it follows (not as a
                presence child), so it moves at once: never two inputs at a time. */}
            {edit?.kind === "new" && edit.parentId === null && edit.anchorId !== null && g.rows.some((r) => r.node.id === edit.anchorId) && (
              <div className="group group-solo group-new" role="none">
                {editInput(1)}
              </div>
            )}
          </Reveal>
        ))}
      </AnimatePresence>
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

  function renderRow({ node, depth }: VisibleRow, g: RowGuides) {
        const isFocused = node.id === focusedId;
        const isActive = node.id === activeId;
        const hasKids = node.subTasks.length > 0;
        const p = hasKids ? leafProgress([node]) : null;
        const renaming = edit?.kind === "rename" && edit.id === node.id;
        // A new first subtask lands right under this row: its input joins this row's line,
        // which carries on below it when older children are showing.
        const addingChild = edit?.kind === "new" && edit.parentId !== null && edit.anchorId === node.id;
        const childGuides: RowGuides = { rails: [...g.rails, ...(g.more ? [depth - 1] : [])], elbow: true, more: g.stem, stem: false };
        return (
          <Reveal key={node.id}>
            {renaming ? (
              editInput(depth, g)
            ) : (
              <div
                id={`row-${node.id}`}
                role="treeitem"
                aria-level={depth}
                aria-selected={isFocused}
                aria-expanded={hasKids ? !node.collapsed : undefined}
                className={`row ${hasKids ? "row-parent" : ""} ${depth === 1 && hasKids ? "row-head" : ""} ${depth >= 3 ? "row-deep" : ""} ${isFocused ? "row-focused" : ""} ${isActive ? "row-active" : ""} ${node.status === "DONE" ? "row-done" : ""}`}
                style={{ paddingLeft: rowIndent(depth) }}
                onClick={() => setFocusedId(node.id)}
                onDoubleClick={() => {
                  setEdit({ kind: "rename", id: node.id });
                  setDraft(node.title);
                }}
              >
                <Guides depth={depth} g={addingChild ? { ...g, stem: true } : g} hasCaret={hasKids} />
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
                    <span className={`caret ${node.collapsed ? "" : "caret-open"}`} aria-hidden="true">
                      ▸
                    </span>
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
                {isActive && <span className="badge-now">Now</span>}
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
                      data-tip="Work on this (.)"
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
                    data-tip="Add subtask (Shift+Enter)"
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
            {addingChild && editInput(edit.depth, childGuides)}
          </Reveal>
        );
  }
}

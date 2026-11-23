import React, { useEffect, useState, useCallback, useRef, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  createWorkflow,
  addTask,
  startWorkflow,
  completeTask,
  addMicroNote,
  getWorkflow,
  findTaskInWorkflow,
} from "../shared/workflowActions";
import { getMeta, commitMeta, listWorkflowIds } from "../shared/db";
import type { IWorkflowState, ITaskNode, IAppMeta } from "../shared/types";
import {
  validateDomain,
  validateLabel,
  validateNoteContent,
  validateGracePeriod,
  LIMITS,
} from "../shared/validators";
import { parseExtensionMessage } from "../shared/messages";

// ─── Error Boundary ───────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: unknown): EBState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[OrionHUD] Unhandled render error", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#0a0c12", color: "#f1f5f9",
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12, padding: 24
        }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <strong style={{ fontSize: 14 }}>OrionHUD encountered an error</strong>
          <code style={{ fontSize: 11, color: "#94a3b8", wordBreak: "break-all" }}>
            {this.state.message}
          </code>
          <button
            style={{
              marginTop: 8, padding: "8px 16px", borderRadius: 6,
              background: "#6366f1", color: "#fff", border: "none",
              fontFamily: "inherit", fontWeight: 600, cursor: "pointer"
            }}
            onClick={() => window.location.reload()}
          >Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Job category definitions ──────────────────────────────────────────────
const JOB_CATEGORIES = [
  { id: "software",    label: "Software",        icon: "💻" },
  { id: "cloud",       label: "Cloud / DevOps",  icon: "☁️" },
  { id: "data",        label: "Data & Analytics",icon: "📊" },
  { id: "design",      label: "Design / UX",     icon: "🎨" },
  { id: "research",    label: "Research",         icon: "🔬" },
  { id: "management",  label: "Management",       icon: "📋" },
  { id: "security",    label: "Security",         icon: "🔒" },
  { id: "custom",      label: "Custom",           icon: "✨" },
] as const;

type CategoryId = (typeof JOB_CATEGORIES)[number]["id"];

// Suggested distraction domains per category
const CATEGORY_DISTRACTIONS: Record<CategoryId, string[]> = {
  software:   ["reddit.com", "youtube.com", "twitter.com", "x.com"],
  cloud:      ["reddit.com", "youtube.com", "twitter.com", "x.com"],
  data:       ["reddit.com", "youtube.com", "twitter.com", "x.com"],
  design:     ["reddit.com", "youtube.com", "twitter.com", "x.com", "instagram.com"],
  research:   ["reddit.com", "youtube.com", "twitter.com", "x.com", "facebook.com"],
  management: ["reddit.com", "youtube.com", "twitter.com", "x.com"],
  security:   ["reddit.com", "youtube.com", "twitter.com", "x.com"],
  custom:     [],
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function statusDot(status: ITaskNode["status"]) {
  const map: Record<ITaskNode["status"], string> = {
    PENDING:  "dot-pending",
    ACTIVE:   "dot-active",
    DONE:     "dot-done",
    SNOOZED:  "dot-snoozed",
  };
  return map[status];
}

function statusBadge(status: ITaskNode["status"]) {
  const map: Record<ITaskNode["status"], [string, string]> = {
    PENDING: ["badge-pending", "Pending"],
    ACTIVE:  ["badge-active",  "Active"],
    DONE:    ["badge-done",    "Done"],
    SNOOZED: ["badge-snoozed", "Snoozed"],
  };
  const [cls, label] = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ─── Recovery Banner ───────────────────────────────────────────────────────
interface RecoveryInfo { afkMs: number; workflowName: string; taskTitle: string | null }

function RecoveryBanner({ info, onDismiss }: { info: RecoveryInfo; onDismiss: () => void }) {
  return (
    <div className="recovery-banner animate-in">
      <div className="recovery-title">⏰ Welcome back!</div>
      <div className="recovery-body">
        You were away for <strong>{formatDuration(info.afkMs)}</strong> during{" "}
        <strong>{info.workflowName}</strong>.
        {info.taskTitle && <> Current task: <strong>{info.taskTitle}</strong>.</>}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

// ─── Task node (recursive) ─────────────────────────────────────────────────
interface TaskNodeProps {
  node: ITaskNode;
  workflowId: string;
  activeNodeId: string | null;
  depth?: number;
  onComplete: (taskId: string) => void;
  onNote: (taskId: string, content: string) => void;
  onStart: (taskId: string) => void;
}

function TaskNodeView({
  node, workflowId, activeNodeId, depth = 0,
  onComplete, onNote, onStart
}: TaskNodeProps) {
  const [noteText, setNoteText] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const isActive = node.id === activeNodeId;
  const isDone = node.status === "DONE";

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    onNote(node.id, noteText.trim());
    setNoteText("");
  }

  return (
    <div
      className={`task-item ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
      style={depth > 0 ? { marginLeft: depth * 12 } : undefined}
    >
      <div className="task-item-header">
        <span className={`task-status-dot ${statusDot(node.status)}`} />
        <span className="task-title">{node.title}</span>
        <div className="task-actions">
          {statusBadge(node.status)}
          {node.allocatedTimeMs && (
            <span className="timer" style={{ marginLeft: 4 }}>
              {formatDuration(node.allocatedTimeMs)}
            </span>
          )}
          {node.status === "PENDING" && !isActive && (
            <button
              className="btn btn-ghost btn-sm"
              title="Set as active task"
              onClick={() => onStart(node.id)}
            >▶</button>
          )}
          {node.status === "ACTIVE" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onComplete(node.id)}
            >✓ Done</button>
          )}
          {node.microNotes.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowNotes(v => !v)}
              title="Notes"
            >📝 {node.microNotes.length}</button>
          )}
        </div>
      </div>

      {/* Micro-note input (only for active task) */}
      {isActive && (
        <form className="note-row" style={{ padding: "0 10px 8px" }} onSubmit={submitNote}>
          <input
            type="text"
            placeholder="Quick note or command…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost btn-sm">Add</button>
        </form>
      )}

      {/* Notes list */}
      {showNotes && node.microNotes.length > 0 && (
        <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
          {node.microNotes.map(n => (
            <div key={n.id} style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 6 }}>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span>{n.content}</span>
              {n.isActionableCommand && (
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>⚡</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Subtasks */}
      {node.subTasks.length > 0 && (
        <div className="task-subtasks">
          {node.subTasks.map(sub => (
            <TaskNodeView
              key={sub.id}
              node={sub}
              workflowId={workflowId}
              activeNodeId={activeNodeId}
              depth={depth + 1}
              onComplete={onComplete}
              onNote={onNote}
              onStart={onStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Workflow Form ──────────────────────────────────────────────────
interface CreateFormProps {
  onCreated: (wf: IWorkflowState) => void;
  onCancel?: () => void;
}

function CreateWorkflowForm({ onCreated, onCancel }: CreateFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryId>("software");
  const [graceMins, setGraceMins] = useState(5);
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [domainError, setDomainError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskTitleError, setTaskTitleError] = useState("");
  const [taskMins, setTaskMins] = useState<number | "">("" );
  const [tasks, setTasks] = useState<{ title: string; mins?: number }[]>([]);
  const [nameError, setNameError] = useState("");
  const [busy, setBusy] = useState(false);

  // Pre-fill domains from category defaults
  function selectCategory(id: CategoryId) {
    setCategory(id);
    setDomains(CATEGORY_DISTRACTIONS[id]);
  }

  function addDomain() {
    setDomainError("");
    if (!domainInput.trim()) return;
    const validated = validateDomain(domainInput);
    if (!validated) {
      setDomainError("Invalid domain. Enter a bare hostname like reddit.com");
      return;
    }
    if (domains.length >= LIMITS.maxDomains) {
      setDomainError(`Maximum ${LIMITS.maxDomains} domains allowed`);
      return;
    }
    if (!domains.includes(validated)) setDomains(prev => [...prev, validated]);
    setDomainInput("");
  }

  function addTaskRow() {
    setTaskTitleError("");
    const validated = validateLabel(taskTitle, LIMITS.taskTitle);
    if (!validated) {
      setTaskTitleError(taskTitle.length > LIMITS.taskTitle
        ? `Max ${LIMITS.taskTitle} characters`
        : "Task title cannot be empty");
      return;
    }
    if (tasks.length >= LIMITS.maxTasks) { setTaskTitleError(`Max ${LIMITS.maxTasks} tasks`); return; }
    const validMins = taskMins === "" ? undefined : validateGracePeriod(Number(taskMins)) ?? undefined;
    setTasks(prev => [...prev, { title: validated, mins: validMins }]);
    setTaskTitle("");
    setTaskMins("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    const validName = validateLabel(name, LIMITS.workflowName);
    if (!validName) {
      setNameError(name.length > LIMITS.workflowName
        ? `Max ${LIMITS.workflowName} characters`
        : "Workflow name cannot be empty");
      return;
    }
    if (tasks.length === 0) return;
    const validGrace = validateGracePeriod(graceMins) ?? 5;
    setBusy(true);
    try {
      const wf = await createWorkflow(validName, validGrace, domains, category);
      for (const t of tasks) {
        await addTask(wf.id, null, t.title, {
          allocatedTimeMs: t.mins ? t.mins * 60_000 : null,
        });
      }
      const fresh = await getWorkflow(wf.id);
      onCreated(fresh ?? wf);
    } finally {
      setBusy(false);
    }
  }

  const cat = JOB_CATEGORIES.find(c => c.id === category);

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Category picker */}
      <div>
        <div className="card-title">Job Type</div>
        <div className="category-grid">
          {JOB_CATEGORIES.map(c => (
            <button
              key={c.id}
              type="button"
              className={`category-chip ${category === c.id ? "active" : ""}`}
              onClick={() => selectCategory(c.id)}
            >
              <span className="category-icon">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

        <div className="form-group">
        <label className="form-label">Workflow Name</label>
        <input
          type="text"
          placeholder={`e.g. "${cat?.icon} ${cat?.label} Sprint 3"`}
          value={name}
          maxLength={LIMITS.workflowName}
          onChange={e => { setName(e.target.value); setNameError(""); }}
          required
        />
        {nameError && <span style={{ fontSize: 11, color: "var(--red)" }}>{nameError}</span>}
      </div>

      {/* Grace period */}
      <div className="form-group">
        <label className="form-label">Distraction Grace Period (minutes)</label>
        <input
          type="number"
          min={0}
          max={60}
          value={graceMins}
          onChange={e => setGraceMins(Number(e.target.value))}
        />
      </div>

      {/* Blocked domains */}
      <div>
        <div className="card-title" style={{ marginBottom: 6 }}>Blocked Domains</div>
        <div className="tag-list">
          {domains.map(d => (
            <span key={d} className="tag">
              {d}
              <button
                type="button"
                className="tag-remove"
                onClick={() => setDomains(prev => prev.filter(x => x !== d))}
              >×</button>
            </span>
          ))}
        </div>
        <div className="note-row" style={{ marginTop: 6 }}>
          <input
            type="text"
            placeholder="Add domain (e.g. reddit.com)"
            value={domainInput}
            onChange={e => { setDomainInput(e.target.value); setDomainError(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addDomain}>+ Add</button>
        </div>
        {domainError && <span style={{ fontSize: 11, color: "var(--red)", marginTop: 3, display: "block" }}>{domainError}</span>}
      </div>

      {/* Tasks */}
      <div>
        <div className="card-title" style={{ marginBottom: 6 }}>Tasks</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
          {tasks.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)" }}>
                {t.title} {t.mins ? <span style={{ color: "var(--text-muted)" }}>({t.mins}m)</span> : null}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))}
              >✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Task title"
            value={taskTitle}
            maxLength={LIMITS.taskTitle}
            onChange={e => { setTaskTitle(e.target.value); setTaskTitleError(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTaskRow(); } }}
            style={{ flex: 2 }}
          />
          <input
            type="number"
            placeholder="min"
            min={1}
            max={480}
            value={taskMins}
            onChange={e => setTaskMins(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ flex: 0.7 }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTaskRow}>+ Add</button>
        </div>
        {taskTitleError && <span style={{ fontSize: 11, color: "var(--red)", marginTop: 3, display: "block" }}>{taskTitleError}</span>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={busy || !name.trim() || tasks.length === 0}
        >
          {busy ? "Creating…" : "Create Workflow"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}

// ─── Active workflow view ──────────────────────────────────────────────────
interface ActiveViewProps {
  workflow: IWorkflowState;
  meta: IAppMeta;
  recovery: RecoveryInfo | null;
  onDismissRecovery: () => void;
  onRefresh: () => void;
  onStop: () => void;
}

function ActiveWorkflowView({ workflow, meta, recovery, onDismissRecovery, onRefresh, onStop }: ActiveViewProps) {
  const cat = JOB_CATEGORIES.find(c => c.id === workflow.category);

  async function handleComplete(taskId: string) {
    await completeTask(workflow.id, taskId);
    onRefresh();
  }

  async function handleNote(taskId: string, content: string) {
    await addMicroNote(workflow.id, taskId, content, content.startsWith("!"));
    onRefresh();
  }

  async function handleStart(taskId: string) {
    const currentMeta = await getMeta();
    await commitMeta({ ...currentMeta, currentActiveNodeId: taskId });
    onRefresh();
  }

  const total = workflow.rootNodes.length;
  const done = workflow.rootNodes.filter(n => n.status === "DONE").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {recovery && (
        <RecoveryBanner info={recovery} onDismiss={onDismissRecovery} />
      )}

      {/* Active workflow header */}
      <div className="card active-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 3 }}>
              {cat ? `${cat.icon} ${cat.label}` : "Active Workflow"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{workflow.name}</div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={onStop}>Stop</button>
        </div>
        {/* Progress bar */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Progress</span>
            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {done}/{total} tasks
            </span>
          </div>
          <div style={{
            height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden"
          }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, var(--accent), var(--violet))",
              borderRadius: 99,
              transition: "width 400ms ease",
            }} />
          </div>
        </div>
      </div>

      {/* Task tree */}
      <div>
        <div className="card-title">Tasks</div>
        {workflow.rootNodes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-text">No tasks yet.</div>
          </div>
        ) : (
          <div className="task-list">
            {workflow.rootNodes.map(node => (
              <TaskNodeView
                key={node.id}
                node={node}
                workflowId={workflow.id}
                activeNodeId={meta.currentActiveNodeId}
                onComplete={handleComplete}
                onNote={handleNote}
                onStart={handleStart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow selector ─────────────────────────────────────────────────────
interface SelectorProps {
  workflows: IWorkflowState[];
  onSelect: (wf: IWorkflowState) => void;
  onCreate: () => void;
}

function WorkflowSelector({ workflows, onSelect, onCreate }: SelectorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button className="btn btn-primary btn-full" onClick={onCreate}>
        + New Workflow
      </button>
      {workflows.length > 0 && (
        <>
          <div className="divider" />
          <div className="card-title">Saved Workflows</div>
          {workflows.map(wf => {
            const cat = JOB_CATEGORIES.find(c => c.id === wf.category);
            const done = wf.rootNodes.filter(n => n.status === "DONE").length;
            return (
              <button
                key={wf.id}
                className="btn btn-ghost btn-full"
                style={{ justifyContent: "flex-start", gap: 10, padding: "10px 12px", height: "auto" }}
                onClick={() => onSelect(wf)}
              >
                <span style={{ fontSize: 18 }}>{cat?.icon ?? "📋"}</span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{wf.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                    {done}/{wf.rootNodes.length} tasks · {cat?.label ?? "Custom"}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      )}
      {workflows.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🚀</div>
          <div className="empty-text">No workflows yet.<br />Create one to get started.</div>
        </div>
      )}
    </div>
  );
}

// ─── Workflow detail (pre-start) ───────────────────────────────────────────
interface DetailProps {
  workflow: IWorkflowState;
  onStart: (wf: IWorkflowState, firstTaskId: string) => void;
  onBack: () => void;
}

function WorkflowDetail({ workflow, onStart, onBack }: DetailProps) {
  const cat = JOB_CATEGORIES.find(c => c.id === workflow.category);
  const firstPending = workflow.rootNodes.find(n => n.status === "PENDING");

  async function handleStart() {
    if (!firstPending) return;
    // Request optional host permission so the distraction guard can read tab URLs.
    const granted = await new Promise<boolean>(resolve => {
      chrome.permissions.request({ origins: ["<all_urls>"] }, resolve);
    });
    if (!granted) {
      // Still start — distraction guard won't have URL visibility but the
      // rest of the workflow engine works fine without it.
    }
    await startWorkflow(workflow.id, firstPending.id);
    onStart(workflow, firstPending.id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <span style={{ fontSize: 16 }}>{cat?.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{workflow.name}</span>
      </div>

      <div className="card">
        <div className="card-title">Tasks</div>
        {workflow.rootNodes.length === 0 ? (
          <div className="empty-state"><div className="empty-text">No tasks yet.</div></div>
        ) : (
          <div className="task-list">
            {workflow.rootNodes.map(node => (
              <div key={node.id} className={`task-item ${node.status === "DONE" ? "done" : ""}`}>
                <div className="task-item-header">
                  <span className={`task-status-dot ${statusDot(node.status)}`} />
                  <span className="task-title">{node.title}</span>
                  {statusBadge(node.status)}
                  {node.allocatedTimeMs && (
                    <span className="timer">{formatDuration(node.allocatedTimeMs)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {workflow.blacklistedDomains.length > 0 && (
        <div className="card">
          <div className="card-title">Blocked Sites</div>
          <div className="tag-list">
            {workflow.blacklistedDomains.map(d => (
              <span key={d} className="tag">{d}</span>
            ))}
          </div>
        </div>
      )}

      <button
        className="btn btn-primary btn-full"
        onClick={handleStart}
        disabled={!firstPending}
      >
        {firstPending ? `▶ Start — ${firstPending.title}` : "All tasks complete"}
      </button>
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────
type View = "selector" | "create" | "detail" | "active";

function App() {
  const [view, setView]                   = useState<View>("selector");
  const [workflows, setWorkflows]          = useState<IWorkflowState[]>([]);
  const [selectedWf, setSelectedWf]        = useState<IWorkflowState | null>(null);
  const [meta, setMeta]                    = useState<IAppMeta | null>(null);
  const [recovery, setRecovery]            = useState<RecoveryInfo | null>(null);
  const refreshRef                         = useRef(0);

  // Load all workflows + meta on mount
  const loadAll = useCallback(async () => {
    const [ids, m] = await Promise.all([listWorkflowIds(), getMeta()]);
    const wfs = (await Promise.all(ids.map(id => getWorkflow(id)))).filter(
      (w): w is IWorkflowState => w !== undefined
    );
    setWorkflows(wfs);
    setMeta(m);

    // Restore active workflow view
    if (m.activeWorkflowId) {
      const active = wfs.find(w => w.id === m.activeWorkflowId);
      if (active) {
        setSelectedWf(active);
        setView("active");
      }
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Listen for ORION_SHOW_RECOVERY from the background worker.
  // parseExtensionMessage validates the shape before any field is accessed.
  useEffect(() => {
    function onMessage(raw: unknown) {
      const msg = parseExtensionMessage(raw);
      if (!msg || msg.type !== "ORION_SHOW_RECOVERY") return;
      const task = msg.currentActiveNodeId
        ? findTaskInWorkflow(msg.workflow, msg.currentActiveNodeId)
        : null;
      setRecovery({
        afkMs: msg.afkMs,
        workflowName: msg.workflow.name,
        taskTitle: task?.title ?? null,
      });
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  function refresh() {
    refreshRef.current++;
    void loadAll();
  }

  async function handleStop() {
    if (!meta) return;
    await commitMeta({ ...meta, activeWorkflowId: null, currentActiveNodeId: null, blacklistedSince: null });
    setView("selector");
    setSelectedWf(null);
    void loadAll();
  }

  return (
    <div className="panel">
      {/* Header */}
      <div className="panel-header">
        <div className="logo-dot" />
        <div>
          <div className="panel-title">OrionHUD</div>
          <div className="panel-subtitle">
            {view === "active" && selectedWf
              ? `▶ ${selectedWf.name}`
              : "Deep Work Control Deck"}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="panel-body">

        {view === "selector" && (
          <WorkflowSelector
            workflows={workflows}
            onSelect={wf => { setSelectedWf(wf); setView("detail"); }}
            onCreate={() => setView("create")}
          />
        )}

        {view === "create" && (
          <div className="card animate-in">
            <div className="card-title" style={{ marginBottom: 12 }}>New Workflow</div>
            <CreateWorkflowForm
              onCreated={wf => {
                setSelectedWf(wf);
                setView("detail");
                refresh();
              }}
              onCancel={() => setView("selector")}
            />
          </div>
        )}

        {view === "detail" && selectedWf && (
          <WorkflowDetail
            workflow={selectedWf}
            onStart={(_wf, _firstTaskId) => {
              refresh();
            }}
            onBack={() => setView("selector")}
          />
        )}

        {view === "active" && selectedWf && meta && (
          <ActiveWorkflowView
            workflow={selectedWf}
            meta={meta}
            recovery={recovery}
            onDismissRecovery={() => setRecovery(null)}
            onRefresh={refresh}
            onStop={handleStop}
          />
        )}
      </div>
    </div>
  );
}

// Wrap the default export so any unhandled render error shows a
// recoverable fallback instead of a blank white panel.
export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

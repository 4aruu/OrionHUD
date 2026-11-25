import type { IAppMeta, IWorkflowState } from "../../shared/types";
import { leafProgress, walk } from "../../shared/taskTree";
import { categoryOf } from "../lib/categories";
import { formatAgo } from "../lib/format";
import { BrandName } from "./BrandName";

interface Props {
  workflows: IWorkflowState[];
  meta: IAppMeta;
  now: number;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
}

function lastSaved(wf: IWorkflowState): number | null {
  let t: number | null = null;
  walk(wf.rootNodes, (n) => {
    const c = n.savePoints[0]?.createdAt;
    if (c !== undefined && (t === null || c > t)) t = c;
  });
  return t;
}

export function WorkflowSelector({ workflows, meta, now, onOpen, onCreate, onSettings }: Props) {
  if (workflows.length === 0) {
    return (
      <div className="onboard">
        <h2>Never lose your place again</h2>
        <ol>
          <li>Break your work into milestones and nested subtasks.</li>
          <li>When you switch, step away, or close the browser, <BrandName /> saves a save point: your next step, your tabs, your AI threads.</li>
          <li>Come back to one card that tells you exactly where you were.</li>
        </ol>
        <button className="btn btn-primary btn-full" onClick={onCreate}>
          Create your first workflow
        </button>
        <button className="btn btn-ghost btn-full" onClick={onSettings}>
          Import a backup
        </button>
      </div>
    );
  }

  const sorted = [...workflows].sort((a, b) => {
    if (a.id === meta.activeWorkflowId) return -1;
    if (b.id === meta.activeWorkflowId) return 1;
    return (lastSaved(b) ?? b.createdAt) - (lastSaved(a) ?? a.createdAt);
  });

  return (
    <div className="selector">
      <div className="selector-head">
        <h2>Workflows</h2>
        <button className="icon-btn" aria-label="Settings" data-tip="Settings" onClick={onSettings}>
          ⚙
        </button>
      </div>
      <ul className="wf-list">
        {sorted.map((wf) => {
          const p = leafProgress(wf.rootNodes);
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          const cat = categoryOf(wf.category);
          const saved = lastSaved(wf);
          const active = wf.id === meta.activeWorkflowId;
          return (
            <li key={wf.id}>
              <button className={`wf-card ${active ? "wf-card-active" : ""}`} onClick={() => onOpen(wf.id)}>
                <span className="wf-body">
                  <span className="wf-name">
                    {wf.name} {active && <span className="badge-now">Active</span>}
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span style={{ transform: `scaleX(${pct / 100})` }} />
                  </span>
                  <span className="muted small">
                    {cat ? `${cat.label} · ` : ""}{p.done}/{p.total} done{saved ? ` · saved ${formatAgo(now - saved)}` : ""}
                    {wf.inbox.length ? ` · ${wf.inbox.length} in inbox` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn btn-primary btn-full" onClick={onCreate}>
        New workflow
      </button>
    </div>
  );
}

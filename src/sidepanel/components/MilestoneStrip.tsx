import type { ITaskNode } from "../../shared/types";
import { leafProgress, walk } from "../../shared/taskTree";

export function MilestoneStrip({ roots, onFocus }: { roots: ITaskNode[]; onFocus: (id: string) => void }) {
  const milestones: ITaskNode[] = [];
  walk(roots, (n) => {
    if (n.isMilestone) milestones.push(n);
  });
  if (!milestones.length) return null;

  return (
    <nav className="milestones" aria-label="Milestones">
      {milestones.map((m) => {
        const p = leafProgress([m]);
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        return (
          <button key={m.id} className={`milestone ${pct === 100 ? "milestone-done" : ""}`} onClick={() => onFocus(m.id)}>
            <span className="milestone-title">⚑ {m.title}</span>
            <span className="bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${pct / 100})` }} />
            </span>
            <span className="milestone-count">
              {p.done}/{p.total}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

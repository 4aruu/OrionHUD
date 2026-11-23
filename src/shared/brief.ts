// The handoff brief: a compact Markdown block you paste into any AI chat or
// agent so it starts where you left off. Deliberately itemized (decisions as
// a list, not a rewritten summary) and bounded in size.
//
// This text format is also the contract the agent bridge serves
// (get_current_task returns exactly this).

import type { ITaskNode, IWorkflowState } from "./types";
import { findPath, findTaskNode, leafProgress } from "./taskTree";
import { latestNextStep, latestTabs } from "./savePoints";

const MAX_DECISIONS = 10;
const MAX_NOTES = 5;
const MAX_OPEN = 15;
const MAX_LINKS = 10;

// Keeps user text from breaking the Markdown structure (a title starting
// with "#" or a newline inside a note would otherwise inject headings).
export function inline(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/^#+\s*/, "").trim();
}

function openSubtasks(node: ITaskNode, depth = 0, out: string[] = []): string[] {
  for (const c of node.subTasks) {
    if (out.length >= MAX_OPEN) break;
    if (c.status === "DONE") continue;
    out.push(`${"  ".repeat(depth)}- [ ] ${inline(c.title)}${c.isMilestone ? " (milestone)" : ""}`);
    openSubtasks(c, depth + 1, out);
  }
  return out;
}

export function buildBrief(workflow: IWorkflowState, taskId: string): string {
  const task = findTaskNode(workflow.rootNodes, taskId);
  if (!task) return `# ${inline(workflow.name)}\n\n(Task not found.)`;

  const path = findPath(workflow.rootNodes, taskId);
  const milestone = [...path].reverse().find((n) => n.isMilestone && n.id !== task.id);
  const overall = leafProgress(workflow.rootNodes);
  const local = leafProgress([task]);
  const nextStep = latestNextStep(task.savePoints);

  const lines: string[] = [];
  lines.push(`# Context: ${inline(workflow.name)}`);
  lines.push("");
  lines.push(`I'm resuming work. Pick up from here; ask before changing the plan.`);
  lines.push("");
  lines.push(`- **Current task:** ${path.map((n) => inline(n.title)).join(" › ")}`);
  if (milestone) lines.push(`- **Milestone:** ${inline(milestone.title)}`);
  lines.push(`- **Progress:** ${overall.done}/${overall.total} overall` + (task.subTasks.length ? `, ${local.done}/${local.total} in this task` : ""));
  if (nextStep) lines.push(`- **Next step:** ${inline(nextStep)}`);

  const decisions = task.microNotes.filter((n) => n.kind === "decision").slice(-MAX_DECISIONS).reverse();
  if (decisions.length) {
    lines.push("", "## Decisions so far");
    for (const d of decisions) lines.push(`- ${inline(d.content)}`);
  }

  const open = openSubtasks(task);
  if (open.length) {
    lines.push("", "## Open subtasks", ...open);
  }

  const notes = task.microNotes.filter((n) => n.kind === "note").slice(-MAX_NOTES).reverse();
  if (notes.length) {
    lines.push("", "## Recent notes");
    for (const n of notes) lines.push(`- ${inline(n.content)}`);
  }

  const links = latestTabs(task.savePoints).slice(0, MAX_LINKS);
  if (links.length) {
    lines.push("", "## Links");
    for (const l of links) {
      const label = l.vendor ? `${l.vendor} thread: ${inline(l.title)}` : inline(l.title);
      const safeUrl = l.url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20");
      lines.push(`- [${label.replace(/[[\]]/g, "")}](${safeUrl})`);
    }
  }

  return lines.join("\n");
}

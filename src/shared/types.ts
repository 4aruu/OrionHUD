// Per-workflow state, not a single global blob. This is what lets
// commitWorkflow() below write only the workflow that changed instead
// of re-serializing every workflow the user has ever created.

export interface IMicroNote {
  id: string;
  content: string;
  timestamp: number;
  isActionableCommand: boolean;
}

export type NodeStatus = "PENDING" | "ACTIVE" | "DONE" | "SNOOZED";

export interface ITaskNode {
  id: string;
  parentId: string | null;
  title: string;
  status: NodeStatus;
  allocatedTimeMs: number | null;
  timeRemainingMs: number | null;
  startedAt: number | null;
  completedAt: number | null;
  // Null means "no URL check for this task", not "unset". The Time's
  // Up evaluator treats null as always on-target (see evaluateDrift in
  // urlMatching.ts). This field did not exist in the original spec's
  // ITaskNode even though section 5.1 depends on comparing against it.
  targetUrl: string | null;
  microNotes: IMicroNote[];
  subTasks: ITaskNode[];
}

export interface IWorkflowState {
  id: string;
  name: string;
  // Optional: used for grouping and template selection in the UI.
  // Not enforced by the engine — purely display/organisational metadata.
  // Examples: 'Cloud / DevOps', 'Software', 'Data & Analytics',
  // 'Design / UX', 'Research', 'Management', 'Custom'.
  category?: string;
  globalGracePeriodMins: number;
  // Distraction Guard (spec 5.2). The original doc never specified a
  // schema for "blacklisted domains", it just referenced the concept.
  // Workflow-level, not global: different workflows plausibly have
  // different notions of "off-task" (Slack is a distraction during
  // deep coding, it's the whole job during an on-call rotation).
  blacklistedDomains: string[];
  rootNodes: ITaskNode[];
}

// Small, frequently-updated pointer state. Deliberately separate from
// IWorkflowState so a timer tick never triggers a rewrite of an entire
// task tree.
//
// Note there is no `isIdleStateFrozen` field. The original spec's model
// of "freezing" state in memory during AFK doesn't hold up: MV3 service
// workers can be killed at any point regardless of idle status, so
// nothing can be relied on to sit frozen in memory. Instead every
// mutation is written immediately (see commitWorkflow/mutateWorkflow in
// db.ts) and lastActiveTimestamp is the only thing needed to reconstruct
// AFK duration after a restart.
export interface IAppMeta {
  activeWorkflowId: string | null;
  currentActiveNodeId: string | null;
  lastActiveTimestamp: number;
  // Set to Date.now() when the user first navigates to a blacklisted
  // domain during an active workflow. Cleared when they leave.
  // Persisted here (not a module variable) because MV3 service workers
  // can be killed at any point — a module variable won't survive.
  blacklistedSince: number | null;
}

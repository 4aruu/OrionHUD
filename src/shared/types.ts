// Domain model. Per-workflow state, not a single global blob: commitWorkflow
// writes only the workflow that changed.
//
// Every field added after v0.1 is defaulted by normalize.ts on read, so data
// written by older versions keeps loading.

export type NoteKind = "note" | "decision";

export interface IMicroNote {
  id: string;
  content: string;
  timestamp: number;
  isActionableCommand: boolean;
  // "decision" = pinned from an AI reply or page selection, or marked by the
  // user. Decisions are append-only and itemized on purpose: repeatedly
  // rewritten summaries degrade, itemized logs don't.
  kind: NoteKind;
  sourceUrl: string | null;
}

export type NodeStatus = "PENDING" | "ACTIVE" | "DONE" | "SNOOZED";

export type TabKind = "ai-thread" | "page";

export interface ISavedTab {
  url: string;
  title: string;
  kind: TabKind;
  // Human name of the AI product for ai-thread tabs ("Claude", "ChatGPT").
  vendor: string | null;
}

// "restart": recovered on browser start from the rolling tab snapshot, so a
// crash or force-quit still has a save point.
export type SavePointTrigger = "switch" | "idle" | "manual" | "stop" | "complete" | "restart";

// Rolling snapshot of the active task's tabs, refreshed every couple of
// minutes while the tabs permission is granted.
export interface ILiveTabs {
  workflowId: string;
  taskId: string;
  tabs: ISavedTab[];
  updatedAt: number;
}

// "window": every normal tab in the focused window (needs optional `tabs`).
// "active": only the active tab (readable via activeTab grant).
// "none":   tab URLs weren't readable at capture time.
export type TabsSource = "window" | "active" | "none";

export interface ISavePoint {
  id: string;
  createdAt: number;
  trigger: SavePointTrigger;
  // The one line that makes resuming cheap: what you were about to do.
  nextStep: string | null;
  tabs: ISavedTab[];
  tabsSource: TabsSource;
}

export interface ITaskNode {
  id: string;
  parentId: string | null;
  title: string;
  status: NodeStatus;
  allocatedTimeMs: number | null;
  timeRemainingMs: number | null;
  startedAt: number | null;
  completedAt: number | null;
  // Null means "no URL check for this task". The Time's Up evaluator treats
  // null as always on-target (see evaluateDrift in urlMatching.ts).
  targetUrl: string | null;
  isMilestone: boolean;
  collapsed: boolean;
  microNotes: IMicroNote[];
  // Newest first, capped (LIMITS.savePoints).
  savePoints: ISavePoint[];
  subTasks: ITaskNode[];
}

export interface IInboxItem {
  id: string;
  text: string;
  createdAt: number;
  // Task that was active when the thought was captured, for context.
  taskId: string | null;
  sourceUrl: string | null;
}

export interface IWorkflowState {
  id: string;
  name: string;
  // Display/organisational metadata only, not enforced by the engine.
  category?: string;
  createdAt: number;
  globalGracePeriodMins: number;
  // Distraction Guard. Workflow-level: Slack is a distraction during deep
  // coding and the whole job during an on-call rotation.
  blacklistedDomains: string[];
  rootNodes: ITaskNode[];
  // Side quests captured mid-flow, triaged later.
  inbox: IInboxItem[];
}

// Small, frequently-updated pointer state, separate from IWorkflowState so a
// pointer change never rewrites a whole task tree.
//
// MV3 service workers can be killed at any point, so nothing is "frozen" in
// memory: every mutation is written immediately and lastActiveTimestamp is
// enough to reconstruct time away after a restart.
export interface IAppMeta {
  activeWorkflowId: string | null;
  currentActiveNodeId: string | null;
  lastActiveTimestamp: number;
  // Persisted (not a module variable) because the worker can die mid-grace.
  blacklistedSince: number | null;
  // When the resume card was last dismissed; a save point newer than this
  // brings the card back.
  lastResumeShownAt: number | null;
}

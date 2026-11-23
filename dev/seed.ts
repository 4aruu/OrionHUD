// Demo data: a workflow you "left" 42 minutes ago to go to a meeting, with an
// idle save point holding a next step, a Claude thread, and decisions.

import { commitMeta, putWorkflows } from "../src/shared/db";
import type { ITaskNode, IWorkflowState } from "../src/shared/types";

let n = 0;
function task(title: string, subTasks: ITaskNode[] = [], extra: Partial<ITaskNode> = {}): ITaskNode {
  const id = `demo-${++n}`;
  return {
    id,
    parentId: null,
    title,
    status: "PENDING",
    allocatedTimeMs: null,
    timeRemainingMs: null,
    startedAt: null,
    completedAt: null,
    targetUrl: null,
    isMilestone: false,
    collapsed: false,
    microNotes: [],
    savePoints: [],
    subTasks: subTasks.map((s) => ({ ...s, parentId: id })),
    ...extra,
  };
}

export async function seedDemo(): Promise<void> {
  const now = Date.now();
  const away = now - 42 * 60_000;
  const retry = task("Write retry test", [task("Mock 401 from /token"), task("Assert single refresh", [], { status: "DONE", completedAt: away })], {
    status: "ACTIVE",
    startedAt: away - 25 * 60_000,
    allocatedTimeMs: 45 * 60_000,
    microNotes: [
      { id: "d1", content: "Exponential backoff, max 3 retries (agreed with Claude after comparing jitter options)", kind: "decision", timestamp: away - 600_000, isActionableCommand: false, sourceUrl: "https://claude.ai/chat/7f3c" },
      { id: "d2", content: "Refresh lock lives in TokenStore, not the HTTP client", kind: "decision", timestamp: away - 300_000, isActionableCommand: false, sourceUrl: null },
      { id: "n1", content: "!npm test -- token", kind: "note", timestamp: away - 200_000, isActionableCommand: true, sourceUrl: null },
    ],
    savePoints: [
      {
        id: "sp1",
        createdAt: away,
        trigger: "idle",
        nextStep: "Make the mock return 401 twice, then assert refresh() is called exactly once",
        tabsSource: "window",
        tabs: [
          { url: "https://claude.ai/chat/7f3c", title: "Token refresh retry design", kind: "ai-thread", vendor: "Claude" },
          { url: "https://github.com/acme/payments/pull/412", title: "PR #412 · refresh tokens", kind: "page", vendor: null },
          { url: "https://developer.mozilla.org/en-US/docs/Web/API/fetch", title: "fetch() - MDN", kind: "page", vendor: null },
        ],
      },
    ],
  });
  const tokenRefresh = task("Token refresh", [task("Design refresh lock", [], { status: "DONE" }), retry], { isMilestone: true });
  const auth = task("Auth refactor", [tokenRefresh, task("Logout everywhere", [task("Revoke sessions endpoint"), task("UI: sign out other devices")])]);
  const release = task("Release v2.3", [task("Changelog"), task("Canary rollout")], { isMilestone: true });

  const wf: IWorkflowState = {
    id: "demo-wf",
    name: "Payments API v2",
    category: "software",
    createdAt: now - 3 * 86_400_000,
    globalGracePeriodMins: 5,
    blacklistedDomains: ["reddit.com", "x.com"],
    rootNodes: [auth, release],
    inbox: [
      { id: "i1", text: "Rate limit on /token looks too low for mobile retries", createdAt: away - 900_000, taskId: retry.id, sourceUrl: "https://github.com/acme/payments/pull/412" },
    ],
  };
  await putWorkflows([wf]);
  await commitMeta({ activeWorkflowId: wf.id, currentActiveNodeId: retry.id, lastActiveTimestamp: away, blacklistedSince: null, lastResumeShownAt: null });
}

// Pure grace-period state machine. No chrome.* calls, same pattern as
// evaluateDrift in urlMatching.ts: keep the logic here, keep the
// chrome.tabs plumbing thin and separate in background/index.ts.
//
// blacklistedSince: timestamp (ms) when the user first landed on a
//   blacklisted domain in this grace window, or null if they're not
//   currently on one.
// gracePeriodMins: from IWorkflowState.globalGracePeriodMins.
// now: Date.now() — passed in so tests are deterministic.

export type GracePeriodStatus = "ok" | "grace" | "expired";

export function evaluateGracePeriod(
  blacklistedSince: number | null,
  gracePeriodMins: number,
  now: number
): GracePeriodStatus {
  if (blacklistedSince === null) return "ok";
  const elapsedMs = now - blacklistedSince;
  const gracePeriodMs = gracePeriodMins * 60 * 1_000;
  if (elapsedMs < gracePeriodMs) return "grace";
  return "expired";
}

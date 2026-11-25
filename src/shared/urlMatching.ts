// Deliberately pure functions, no chrome.* calls. The alarm handler in
// timesUp.ts is thin plumbing around these; these are what get tested.

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Matches "slack.com" against "https://app.slack.com/..." as well as an
// exact host. Not a security boundary, just good enough for a personal
// blacklist (doesn't attempt full public-suffix-list correctness).
export function hostMatches(hostname: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase().replace(/^www\./, "");
  return (
    hostname === normalizedPattern ||
    hostname.endsWith(`.${normalizedPattern}`)
  );
}

export function isUrlBlacklisted(
  url: string | undefined,
  blacklist: string[]
): boolean {
  if (!url) return false; // can't evaluate without a URL, don't guess
  const hostname = getHostname(url);
  if (!hostname) return false;
  return blacklist.some((pattern) => hostMatches(hostname, pattern));
}

export type DriftStatus = "on-target" | "drifted" | "unknown";

// "unknown" exists specifically for the case where tab.url is
// undefined because Orion Waypoint doesn't currently hold permission to read
// it (activeTab expired, optional host permission not granted). Callers
// must NOT collapse "unknown" into "drifted": doing so would nag the
// user on every ungranted tab regardless of whether they're actually
// off-task, which is worse than saying nothing.
export function evaluateDrift(
  currentUrl: string | undefined,
  targetUrl: string | null
): DriftStatus {
  if (targetUrl === null) return "on-target"; // no target configured for this task
  if (currentUrl === undefined) return "unknown";

  const currentHost = getHostname(currentUrl);
  const targetHost = getHostname(targetUrl);

  if (!currentHost || !targetHost) {
    return currentUrl === targetUrl ? "on-target" : "drifted";
  }
  return currentHost === targetHost ? "on-target" : "drifted";
}

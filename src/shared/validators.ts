// Pure validation functions — no chrome.* calls, testable in Node.
// All user-supplied text passes through here before touching storage.

// ─── Limits ────────────────────────────────────────────────────────────────
export const LIMITS = {
  workflowName: 120,
  taskTitle:    200,
  noteContent:  500,
  category:      50,
  domain:       253, // RFC 1035 maximum total length
  graceMins:     { min: 0, max: 1440 }, // 0–24 hours
  maxTasks:      200,
  maxDomains:     50,
} as const;

// ─── Domain validation ─────────────────────────────────────────────────────
// Accepts bare hostnames like "reddit.com" or "app.slack.com".
// Strips leading http(s):// and any path component before testing.
// Returns the normalised domain string, or null if invalid.
const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

export function validateDomain(raw: string): string | null {
  const stripped = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  if (!stripped || stripped.length > LIMITS.domain) return null;
  return DOMAIN_RE.test(stripped) ? stripped : null;
}

// ─── Generic label validation ──────────────────────────────────────────────
// Returns the trimmed string, or null if empty / too long.
export function validateLabel(raw: string, maxLen: number): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

// ─── Specific convenience wrappers ─────────────────────────────────────────
export function validateWorkflowName(raw: string): string | null {
  return validateLabel(raw, LIMITS.workflowName);
}

export function validateTaskTitle(raw: string): string | null {
  return validateLabel(raw, LIMITS.taskTitle);
}

export function validateNoteContent(raw: string): string | null {
  return validateLabel(raw, LIMITS.noteContent);
}

export function validateGracePeriod(mins: number): number | null {
  if (!Number.isFinite(mins)) return null;
  const clamped = Math.round(mins);
  if (clamped < LIMITS.graceMins.min || clamped > LIMITS.graceMins.max) return null;
  return clamped;
}

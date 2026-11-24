// Pure save-point logic: URL safety, AI-thread classification, tab
// sanitizing, resume-card rules. No chrome.* calls.

import type { ISavePoint, ISavedTab, SavePointTrigger, TabKind, TabsSource } from "./types";
import { LIMITS } from "./validators";

/**
 * The only URLs Orion Waypoint will ever store or reopen. Checked on capture AND
 * again on restore (defense in depth: stored data can be imported or edited).
 * Blocks javascript:, data:, file:, chrome:, chrome-extension:, blob:, etc.
 */
export function isRestorableUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0 || url.length > LIMITS.url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  // Credentials in URLs are a leak waiting to happen in an export file.
  if (parsed.username || parsed.password) return false;
  return parsed.hostname.length > 0;
}

interface AiHost {
  host: string;
  pathPrefix?: string;
  vendor: string;
}

// Where developers' AI conversations live. Matching is host (and optional
// path prefix) based; subdomains of host also match.
const AI_HOSTS: AiHost[] = [
  { host: "claude.ai", vendor: "Claude" },
  { host: "chatgpt.com", vendor: "ChatGPT" },
  { host: "chat.openai.com", vendor: "ChatGPT" },
  { host: "gemini.google.com", vendor: "Gemini" },
  { host: "aistudio.google.com", vendor: "AI Studio" },
  { host: "copilot.microsoft.com", vendor: "Copilot" },
  { host: "github.com", pathPrefix: "/copilot", vendor: "GitHub Copilot" },
  { host: "perplexity.ai", vendor: "Perplexity" },
  { host: "chat.deepseek.com", vendor: "DeepSeek" },
  { host: "grok.com", vendor: "Grok" },
  { host: "chat.mistral.ai", vendor: "Mistral" },
  { host: "v0.dev", vendor: "v0" },
  { host: "v0.app", vendor: "v0" },
  { host: "bolt.new", vendor: "Bolt" },
  { host: "lovable.dev", vendor: "Lovable" },
  { host: "cursor.com", pathPrefix: "/agents", vendor: "Cursor" },
  { host: "jules.google.com", vendor: "Jules" },
];

export function classifyUrl(url: string): { kind: TabKind; vendor: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "page", vendor: null };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  for (const h of AI_HOSTS) {
    const hostOk = host === h.host || host.endsWith(`.${h.host}`);
    const pathOk = !h.pathPrefix || parsed.pathname.startsWith(h.pathPrefix);
    if (hostOk && pathOk) return { kind: "ai-thread", vendor: h.vendor };
  }
  return { kind: "page", vendor: null };
}

export interface RawTab {
  url?: unknown;
  title?: unknown;
  pinned?: unknown;
}

function cleanTitle(title: unknown, fallback: string): string {
  const t = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return (t || fallback).slice(0, LIMITS.tabTitle);
}

/**
 * Raw chrome.tabs.Tab-like objects → safe, deduped ISavedTab list.
 * Pinned tabs are skipped (they're global, not task context). AI threads
 * sort first because they're the most expensive context to lose.
 */
export function sanitizeTabs(raw: RawTab[]): ISavedTab[] {
  const seen = new Set<string>();
  const out: ISavedTab[] = [];
  for (const t of raw) {
    if (t.pinned === true) continue;
    if (!isRestorableUrl(t.url)) continue;
    if (seen.has(t.url)) continue;
    seen.add(t.url);
    const { kind, vendor } = classifyUrl(t.url);
    out.push({ url: t.url, title: cleanTitle(t.title, t.url), kind, vendor });
  }
  const ai = out.filter((t) => t.kind === "ai-thread");
  const pages = out.filter((t) => t.kind === "page");
  return [...ai, ...pages].slice(0, LIMITS.savedTabs);
}

export interface SavePointInput {
  trigger: SavePointTrigger;
  nextStep?: string | null;
  tabs?: ISavedTab[];
  tabsSource?: TabsSource;
}

export function buildSavePoint(input: SavePointInput, now: number, id: string): ISavePoint {
  const step = typeof input.nextStep === "string" ? input.nextStep.trim().slice(0, LIMITS.nextStep) : "";
  const tabs = input.tabs ?? [];
  return {
    id,
    createdAt: now,
    trigger: input.trigger,
    nextStep: step || null,
    tabs,
    tabsSource: tabs.length ? (input.tabsSource ?? "window") : "none",
  };
}

/** Prepends item, keeps the newest `cap`. */
export function pushCapped<T>(list: T[], item: T, cap: number): T[] {
  return [item, ...list].slice(0, cap);
}

/**
 * When a newer save point lacks tabs (e.g. idle capture without the tabs
 * permission), the resume card should still offer the most recent tabs
 * we do have for that task.
 */
export function latestTabs(savePoints: ISavePoint[]): ISavedTab[] {
  return savePoints.find((s) => s.tabs.length > 0)?.tabs ?? [];
}

/** Next step to show: the newest non-empty one. */
export function latestNextStep(savePoints: ISavePoint[]): string | null {
  return savePoints.find((s) => s.nextStep)?.nextStep ?? null;
}

export const RESUME_MIN_AWAY_MS = 5 * 60_000;

export function shouldShowResume(args: {
  latest: ISavePoint | null;
  lastResumeShownAt: number | null;
  now: number;
}): boolean {
  const { latest, lastResumeShownAt, now } = args;
  if (!latest) return false;
  if (lastResumeShownAt !== null && latest.createdAt <= lastResumeShownAt) return false;
  if (latest.trigger === "idle" || latest.trigger === "stop" || latest.trigger === "restart") return true;
  return now - latest.createdAt >= RESUME_MIN_AWAY_MS;
}

export function formatAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

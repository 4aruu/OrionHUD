import { APP_NAME } from "../../shared/brand";

export { formatAgo } from "../../shared/savePoints";

/** "12:05" style countdown; negative values show as overtime. */
export function formatCountdown(ms: number): string {
  const over = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return over ? `+${body}` : body;
}

export function formatMinutes(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

/** Backup export file name, e.g. "orion-waypoint-backup-2026-11-24.json" (UTC date). */
/** "1 decision", "2 decisions", "0 tabs". */
export function countLabel(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function backupFileName(date: Date): string {
  return `orion-waypoint-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.name === "OrionError") return err.message;
  console.error(`[${APP_NAME}]`, err);
  return "Something went wrong. Your data is safe; try again.";
}

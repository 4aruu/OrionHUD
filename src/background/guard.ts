// Distraction Guard. Tab URLs are only visible with the optional `tabs`
// permission; without it tab.url is undefined and the guard simply stays
// quiet (isUrlBlacklisted(undefined) === false), which is the right default.

import { APP_NAME } from "../shared/brand";
import { mutateMeta } from "../shared/db";
import { evaluateGracePeriod } from "../shared/gracePeriod";
import { isUrlBlacklisted } from "../shared/urlMatching";
import { getActiveContext } from "./context";
import { notify } from "./notify";

const NOTIF_COOLDOWN_MS = 5 * 60_000;
// Module-level is fine: if the worker dies, the cooldown resets, and the
// worker only dies after the user has been idle long enough not to care.
const lastNotifAt = new Map<string, number>();

export async function handleTabChange(url: string | undefined): Promise<void> {
  // Focusing Orion's own window (window mode) is neither on- nor off-track: ignore it,
  // so it can't reset the distraction timer.
  if (url && url.startsWith(chrome.runtime.getURL(""))) return;
  const { meta, workflow } = await getActiveContext();
  if (!workflow || !meta.currentActiveNodeId) return;

  if (!isUrlBlacklisted(url, workflow.blacklistedDomains)) {
    if (meta.blacklistedSince !== null) await mutateMeta((m) => ({ ...m, blacklistedSince: null }));
    return;
  }

  const now = Date.now();
  const since = meta.blacklistedSince ?? now;
  if (meta.blacklistedSince === null) await mutateMeta((m) => ({ ...m, blacklistedSince: since }));

  if (evaluateGracePeriod(since, workflow.globalGracePeriodMins, now) !== "expired") return;
  if (now - (lastNotifAt.get(workflow.id) ?? 0) < NOTIF_COOLDOWN_MS) return;
  lastNotifAt.set(workflow.id, now);
  await notify(
    `orion-distraction:${workflow.id}`,
    `Still on “${workflow.name}”?`,
    `You've spent ${workflow.globalGracePeriodMins} min on a site you asked ${APP_NAME} to watch. Your place is saved whenever you head back.`
  );
  await mutateMeta((m) => ({ ...m, blacklistedSince: null }));
}

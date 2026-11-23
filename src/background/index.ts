// Key rule: this file must never assume anything survives in memory between
// events. MV3 kills the service worker on its own schedule, independent of
// chrome.idle state. Every handler reads what it needs from storage on the
// way in and writes what changed on the way out.

import { getMeta, commitMeta, getWorkflow } from "../shared/db";
import { handleAlarm } from "./timesUp";
import { isUrlBlacklisted } from "../shared/urlMatching";
import { evaluateGracePeriod } from "../shared/gracePeriod";
import type { ExtensionMessage } from "../shared/messages";

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm);
});

// When the extension has a sidePanel permission declared, Chrome intercepts
// the toolbar action click to manage the panel — so chrome.action.onClicked
// never fires. We must explicitly opt in to "open panel on click" behaviour.
// Called on both install and each service-worker restart (not persisted).
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Content-script injection is triggered from the side panel UI
// ("Start Workflow" button) rather than the toolbar click, so that the
// HUD only appears when a workflow is actually active.

// --- Distraction Guard ---------------------------------------------------
//
// Checks the current tab's URL whenever the user switches tabs or a tab
// navigates. Only active if <all_urls> optional host permission is granted
// (tab.url is undefined without it — that's the natural gate).
//
// Notification debounce: one notification per workflow per NOTIF_COOLDOWN_MS.
// This prevents rapid tab switching (multiple async handleTabChange calls
// resolving before any commitMeta write lands) from firing duplicate alerts.

const NOTIF_COOLDOWN_MS = 5 * 60_000; // 5 minutes

// workflowId → timestamp of last distraction notification.
// Module-level is fine: if the worker is killed the cooldown resets, which
// is acceptable (the user was idle long enough for the worker to die).
const lastNotifAt = new Map<string, number>();

async function handleTabChange(url: string | undefined): Promise<void> {
  const meta = await getMeta();
  if (!meta.activeWorkflowId) return;

  const workflow = await getWorkflow(meta.activeWorkflowId);
  if (!workflow) return;

  const blacklisted = isUrlBlacklisted(url, workflow.blacklistedDomains);

  if (!blacklisted) {
    if (meta.blacklistedSince !== null) {
      await commitMeta({ ...meta, blacklistedSince: null });
    }
    return;
  }

  const now = Date.now();
  const blacklistedSince = meta.blacklistedSince ?? now;
  if (meta.blacklistedSince === null) {
    await commitMeta({ ...meta, blacklistedSince });
  }

  const status = evaluateGracePeriod(blacklistedSince, workflow.globalGracePeriodMins, now);

  if (status === "expired") {
    const last = lastNotifAt.get(workflow.id) ?? 0;
    if (now - last < NOTIF_COOLDOWN_MS) return; // debounce

    lastNotifAt.set(workflow.id, now);
    await chrome.notifications.create(`orion-distraction:${workflow.id}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "OrionHUD: Off Track",
      message: `You've been on a distracting site for more than ${workflow.globalGracePeriodMins} min during "${workflow.name}".`,
    });
    await commitMeta({ ...meta, blacklistedSince: null });
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  void chrome.tabs.get(activeInfo.tabId).then((tab) => handleTabChange(tab.url));
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    void handleTabChange(tab.url);
  }
});

// --- Idle detection -------------------------------------------------------

const IDLE_THRESHOLD_SECONDS = 900; // 15 minutes

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "idle" || state === "locked") {
    const meta = await getMeta();
    await commitMeta({ ...meta, lastActiveTimestamp: Date.now() });
    return;
  }

  if (state === "active") {
    const meta = await getMeta();
    if (!meta.activeWorkflowId) return;

    const workflow = await getWorkflow(meta.activeWorkflowId);
    if (!workflow) return;

    const afkMs = Date.now() - meta.lastActiveTimestamp;

    const msg: ExtensionMessage = {
      type: "ORION_SHOW_RECOVERY",
      afkMs,
      workflow,
      currentActiveNodeId: meta.currentActiveNodeId,
    };

    chrome.runtime.sendMessage(msg).catch(() => {
      // No listener in the side panel yet — fine, it will read from storage
      // on next open anyway.
    });
  }
});

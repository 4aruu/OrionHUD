// Service worker wiring only. Every listener is registered synchronously at
// the top level (MV3 requirement: listeners added later miss wake-up events),
// and no handler assumes anything survived in memory since the last event.

import { onCommand, onRuntimeMessage } from "./capture";
import { onMenuClicked } from "./menus";
import { onInstalled } from "./install";
import { handleTabChange } from "./guard";
import { handleTaskAlarm } from "./timesUp";
import {
  IDLE_THRESHOLD_SECONDS,
  LIVE_TABS_ALARM,
  ensureLiveTabsAlarm,
  onIdleStateChanged,
  recoverOnStartup,
  refreshLiveTabs,
} from "./idle";
import { APP_NAME } from "../shared/brand";
import { broadcast, notify } from "./notify";
import { COMMAND_WINDOW, initSurface, onActionClicked, openPanelWindow } from "./surface";
import { BRIDGE_RETRY_ALARM, connectBridge, disconnectBridge } from "./bridge";
import { isBridgePermission } from "../platform/bridge";
import { isOwnSender, parseExtensionMessage } from "../shared/messages";

// Optional APIs are feature-detected: a browser missing one (Arc has no side
// panel) loses only that feature, never the whole worker.
const surfaceReady = initSurface().catch(() => "window" as const);
const openFailed = () => notify("orion-open", APP_NAME, `Couldn't open ${APP_NAME}. Try Alt+Shift+O.`);
chrome.action.onClicked.addListener(() => void surfaceReady.then(onActionClicked).catch(openFailed));
if (chrome.idle) chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

// Agent bridge (opt-in). Every worker start reconnects if the permission is
// granted; with the host missing this fails fast and records "not installed".
void connectBridge();

chrome.runtime.onInstalled.addListener((details) => void onInstalled(details));

chrome.runtime.onStartup.addListener(() => {
  void ensureLiveTabsAlarm();
  void recoverOnStartup();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LIVE_TABS_ALARM) {
    void refreshLiveTabs();
    return;
  }
  if (alarm.name === BRIDGE_RETRY_ALARM) {
    void connectBridge();
    return;
  }
  void handleTaskAlarm(alarm).then(() => broadcast("alarm"));
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND_WINDOW) void openPanelWindow().catch(openFailed);
  else onCommand(command, tab);
});
chrome.contextMenus.onClicked.addListener((info) => onMenuClicked(info));
chrome.runtime.onMessage.addListener((raw, sender, respond) => {
  // Settings → Agent bridge → "Check again". Only from our own pages.
  if (isOwnSender(sender, chrome.runtime.id) && !sender.tab && parseExtensionMessage(raw)?.type === "ORION_BRIDGE_CONNECT") {
    void connectBridge().then(() => respond({ ok: true }));
    return true;
  }
  return onRuntimeMessage(raw, sender, respond);
});
if (chrome.permissions) {
  chrome.permissions.onAdded.addListener((perms) => {
    if (isBridgePermission(perms)) void connectBridge();
  });
  chrome.permissions.onRemoved.addListener((perms) => {
    if (isBridgePermission(perms)) void disconnectBridge();
  });
}
if (chrome.idle) chrome.idle.onStateChanged.addListener((state) => void onIdleStateChanged(state));

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs
    .get(tabId)
    .then((tab) => handleTabChange(tab.url))
    .catch(() => undefined);
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) void handleTabChange(tab.url);
});

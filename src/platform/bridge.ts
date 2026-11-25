// chrome.* plumbing for the agent bridge that both the side panel and the
// worker use: the optional permission and the status record.

import { parseBridgeStatus, type BridgeStatus } from "../shared/bridgeProtocol";

export const BRIDGE_PERMISSION: chrome.permissions.Permissions = { permissions: ["nativeMessaging"] };
export const BRIDGE_STATUS_KEY = "bridgeStatus";

export async function hasBridgePermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(BRIDGE_PERMISSION);
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (Chrome requirement). */
export function requestBridgePermission(): Promise<boolean> {
  return chrome.permissions.request(BRIDGE_PERMISSION).catch(() => false);
}

export function removeBridgePermission(): Promise<boolean> {
  return chrome.permissions.remove(BRIDGE_PERMISSION).catch(() => false);
}

export function isBridgePermission(perms: chrome.permissions.Permissions): boolean {
  return perms.permissions?.includes("nativeMessaging") ?? false;
}

export async function writeBridgeStatus(status: BridgeStatus): Promise<void> {
  await chrome.storage.session.set({ [BRIDGE_STATUS_KEY]: status }).catch(() => undefined);
}

export async function readBridgeStatus(): Promise<BridgeStatus | null> {
  try {
    const got = await chrome.storage.session.get(BRIDGE_STATUS_KEY);
    return parseBridgeStatus(got[BRIDGE_STATUS_KEY]);
  } catch {
    return null;
  }
}

/** Calls back whenever the worker updates the status. Returns an unsubscribe. */
export function onBridgeStatus(cb: (s: BridgeStatus | null) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "session" && BRIDGE_STATUS_KEY in changes) cb(parseBridgeStatus(changes[BRIDGE_STATUS_KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

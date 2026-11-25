// The extension end of the agent bridge. Opt-in: nothing happens unless the
// user granted the optional `nativeMessaging` permission in Settings.
//
// The only thing held in memory is the native port itself (a live
// connection, not app state). An open native port keeps the MV3 worker
// alive (Chrome 105+), which is what lets it answer agents. Status for the
// side panel lives in chrome.storage.session.

import { BRIDGE_HOST_NAME, errorResponse, parseHostMessage, type BridgeState } from "../shared/bridgeProtocol";
import { handleBridgeRequest } from "../shared/bridgeService";
import { hasBridgePermission, writeBridgeStatus } from "../platform/bridge";
import { broadcast } from "./notify";

export const BRIDGE_RETRY_ALARM = "orion-bridge-retry";

let port: chrome.runtime.Port | null = null;
let connecting: Promise<void> | null = null;

function setStatus(state: BridgeState, detail: string | null = null, hostVersion: string | null = null): Promise<void> {
  return writeBridgeStatus({ state, detail, hostVersion, at: Date.now() });
}

/** Maps Chrome's disconnect reasons to something the panel can explain. */
export function classifyDisconnect(
  lastError: string | undefined,
  wasConnected: boolean
): { state: BridgeState; detail: string | null; retry: boolean } {
  const msg = (lastError ?? "").slice(0, 200);
  if (/not found/i.test(msg)) return { state: "not-installed", detail: null, retry: false };
  if (/forbidden/i.test(msg)) return { state: "forbidden", detail: null, retry: false };
  if (wasConnected) return { state: "error", detail: msg || "The bridge stopped.", retry: true };
  return { state: "error", detail: msg || "The bridge exited while starting.", retry: false };
}

export function connectBridge(): Promise<void> {
  connecting ??= doConnect().finally(() => (connecting = null));
  return connecting;
}

async function doConnect(): Promise<void> {
  if (port) return;
  if (!(await hasBridgePermission()) || typeof chrome.runtime.connectNative !== "function") {
    await setStatus("off");
    return;
  }
  // Written before connecting so it can never land after the outcome below.
  await setStatus("connecting");
  let p: chrome.runtime.Port;
  try {
    p = chrome.runtime.connectNative(BRIDGE_HOST_NAME);
  } catch (err) {
    await setStatus("error", err instanceof Error ? err.message.slice(0, 200) : "Couldn't start the bridge.");
    return;
  }
  port = p;
  let hello = false;
  // Listeners go on synchronously, with no await in between: Chrome reports a
  // missing host by disconnecting almost at once, and a missed disconnect
  // would leave a dead port that blocks every later "Check again".

  p.onMessage.addListener((raw: unknown) => {
    const msg = parseHostMessage(raw);
    if (!msg) return; // The host validates first; anything malformed here is dropped.
    if (msg.type === "hello") {
      hello = true;
      void setStatus("connected", null, msg.version);
      return;
    }
    void handleBridgeRequest(msg)
      .catch(() => ({ response: errorResponse(msg.id, "internal", "OrionHUD couldn't do that."), changed: false }))
      .then(({ response, changed }) => {
        if (port === p) p.postMessage(response);
        if (changed) broadcast("bridge");
      });
  });

  p.onDisconnect.addListener(() => {
    // Reading lastError here also keeps Chrome from logging it as unchecked.
    const { state, detail, retry } = classifyDisconnect(chrome.runtime.lastError?.message, hello);
    if (port === p) port = null;
    void setStatus(state, detail);
    if (retry) void chrome.alarms.create(BRIDGE_RETRY_ALARM, { delayInMinutes: 1 });
  });
}

export async function disconnectBridge(): Promise<void> {
  const p = port;
  port = null;
  p?.disconnect();
  await chrome.alarms.clear(BRIDGE_RETRY_ALARM).catch(() => false);
  await setStatus("off");
}

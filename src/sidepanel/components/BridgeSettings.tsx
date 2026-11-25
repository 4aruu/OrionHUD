import { useEffect, useState } from "react";
import { APP_NAME } from "../../shared/brand";
import type { BridgeStatus } from "../../shared/bridgeProtocol";
import type { ExtensionMessage } from "../../shared/messages";
import {
  hasBridgePermission,
  onBridgeStatus,
  readBridgeStatus,
  removeBridgePermission,
  requestBridgePermission,
} from "../../platform/bridge";
import { copyText, type Ui } from "../lib/ui";
import { useBusy } from "../hooks/useBusy";
import { BrandName } from "./BrandName";
import { BusyButton, CopyButton } from "./Buttons";

/** Run from the repository root after `npm run build`. */
export function installCommand(extensionId: string): string {
  return `npx --yes --package=./bridge orionhud-bridge install --extension-id ${extensionId}`;
}

function describe(status: BridgeStatus | null): { label: string; tone: "ok" | "warn" | "muted" } {
  switch (status?.state) {
    case "connected":
      return { label: `Connected${status.hostVersion ? ` · bridge ${status.hostVersion}` : ""}. Agents can use ${APP_NAME} now.`, tone: "ok" };
    case "connecting":
      return { label: "Connecting…", tone: "muted" };
    case "not-installed":
      return { label: "Bridge not installed yet. Run the command below, then Check again.", tone: "warn" };
    case "forbidden":
      return { label: "The bridge is installed for a different extension ID. Run the command below again.", tone: "warn" };
    case "error":
      return { label: `The bridge stopped: ${status.detail ?? "unknown reason"}. Check again, or run the command below again.`, tone: "warn" };
    default:
      return { label: "Not connected.", tone: "muted" };
  }
}

export function BridgeSettings({ ui }: { ui: Ui }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [checking, runCheck] = useBusy();

  useEffect(() => {
    void hasBridgePermission().then(setOn);
    void readBridgeStatus().then(setStatus);
    return onBridgeStatus(setStatus);
  }, []);

  // Busy until the background has tried to connect (it replies once done).
  function checkAgain() {
    const msg: ExtensionMessage = { type: "ORION_BRIDGE_CONNECT" };
    void runCheck(() => chrome.runtime.sendMessage(msg).catch(() => undefined));
  }

  function toggle() {
    if (on) {
      void removeBridgePermission().then((removed) => {
        if (removed) setOn(false);
      });
      return;
    }
    // Called directly in the click handler: Chrome requires a user gesture.
    void requestBridgePermission().then((granted) => {
      setOn(granted);
      if (!granted) ui.toast({ kind: "info", text: `No problem. Agents won't be able to reach ${APP_NAME}.` });
    });
  }

  const { label, tone } = describe(status);

  return (
    <section className="card">
      <h3>Agent bridge</h3>
      <p className="muted">
        Lets coding agents (Claude Code, Cursor) read your current task's brief, add and check off its subtasks, and log decisions. Agents can only touch
        the task you're working on and never delete anything. The connection stays on this computer; what an agent reads goes to its AI, like a
        pasted brief. Your browser will describe this as “Communicate with cooperating
        native applications”.
      </p>
      {on && (
        <>
          <p className={`bridge-status bridge-${tone}`} role="status">
            {label}
          </p>
          {status?.state !== "connected" && (
            <>
              <code className="bridge-cmd">{installCommand(chrome.runtime.id)}</code>
              <p className="muted small">
                Run it in a terminal in the project folder. It prints the line to add <BrandName /> to Claude Code or Cursor. Setup steps are in the
                README.
              </p>
            </>
          )}
        </>
      )}
      <div className="row-buttons">
        <button className={`btn btn-sm ${on ? "btn-ghost" : "btn-primary"}`} onClick={toggle} disabled={on === null}>
          {on ? "Turn off agent bridge" : "Turn on agent bridge"}
        </button>
        {on && status?.state !== "connected" && (
          <>
            <CopyButton className="btn btn-ghost btn-sm" copy={() => copyText(installCommand(chrome.runtime.id), ui)}>
              Copy install command
            </CopyButton>
            <BusyButton className="btn btn-ghost btn-sm" busy={checking} onClick={checkAgain}>
              Check again
            </BusyButton>
          </>
        )}
      </div>
    </section>
  );
}

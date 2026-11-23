// Every runtime message OrionHUD sends. All onMessage handlers must
// (1) check the sender is this extension (see isOwnSender) and
// (2) parse through parseExtensionMessage. Never cast raw messages.

import { LIMITS } from "./validators";

export type CaptureMode = "save" | "inbox";

export type StateChangeReason = "idle" | "active" | "capture" | "menu" | "command" | "alarm" | "bridge";

export type ExtensionMessage =
  | { type: "ORION_STATE_CHANGED"; reason: StateChangeReason }
  | { type: "ORION_CAPTURE_SUBMIT"; mode: CaptureMode; text: string }
  | { type: "ORION_BRIDGE_CONNECT" };

const REASONS: StateChangeReason[] = ["idle", "active", "capture", "menu", "command", "alarm", "bridge"];

export function parseExtensionMessage(raw: unknown): ExtensionMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const msg = raw as Record<string, unknown>;

  switch (msg["type"]) {
    case "ORION_STATE_CHANGED": {
      const reason = REASONS.find((r) => r === msg["reason"]);
      return reason ? { type: "ORION_STATE_CHANGED", reason } : null;
    }
    case "ORION_CAPTURE_SUBMIT": {
      const mode = msg["mode"];
      const text = msg["text"];
      if (mode !== "save" && mode !== "inbox") return null;
      if (typeof text !== "string") return null;
      // Empty text is valid for "save" (a save point without a next step).
      if (text.length > LIMITS.inboxText) return null;
      if (mode === "inbox" && text.trim().length === 0) return null;
      return { type: "ORION_CAPTURE_SUBMIT", mode, text };
    }
    case "ORION_BRIDGE_CONNECT":
      return Object.keys(msg).length === 1 ? { type: "ORION_BRIDGE_CONNECT" } : null;
    default:
      return null;
  }
}

/**
 * Only accept messages from this extension's own pages and from content
 * scripts it injected. Web pages can't reach onMessage without
 * externally_connectable, but this keeps that true even if the manifest
 * changes later.
 */
export function isOwnSender(sender: { id?: string }, ownId: string): boolean {
  return typeof sender.id === "string" && sender.id === ownId;
}

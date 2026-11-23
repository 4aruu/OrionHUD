// Typed discriminated union for every message OrionHUD sends internally.
// All chrome.runtime.sendMessage / onMessage callers must use these types
// and parseExtensionMessage() — never cast raw message objects directly.

import type { IWorkflowState } from "./types";
import type { DriftStatus } from "./urlMatching";

export type ExtensionMessage =
  | {
      type: "ORION_SHOW_RECOVERY";
      afkMs: number;
      workflow: IWorkflowState;
      currentActiveNodeId: string | null;
    }
  | {
      type: "ORION_TIMES_UP";
      taskId: string;
      taskTitle: string;
      drift: DriftStatus;
    };

// Runtime type-guard. Returns null for any message that does not match a
// known shape — callers must treat null as "ignore this message".
// This is the only place where raw unknown → typed message coercion happens.
export function parseExtensionMessage(raw: unknown): ExtensionMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;

  switch (msg["type"]) {
    case "ORION_SHOW_RECOVERY": {
      if (typeof msg["afkMs"] !== "number") return null;
      if (!msg["workflow"] || typeof msg["workflow"] !== "object") return null;
      return {
        type: "ORION_SHOW_RECOVERY",
        afkMs: msg["afkMs"],
        workflow: msg["workflow"] as IWorkflowState,
        currentActiveNodeId:
          typeof msg["currentActiveNodeId"] === "string"
            ? msg["currentActiveNodeId"]
            : null,
      };
    }
    case "ORION_TIMES_UP": {
      if (typeof msg["taskId"] !== "string") return null;
      if (typeof msg["taskTitle"] !== "string") return null;
      const drift = msg["drift"];
      if (drift !== "on-target" && drift !== "drifted" && drift !== "unknown")
        return null;
      return {
        type: "ORION_TIMES_UP",
        taskId: msg["taskId"],
        taskTitle: msg["taskTitle"],
        drift,
      };
    }
    default:
      return null;
  }
}

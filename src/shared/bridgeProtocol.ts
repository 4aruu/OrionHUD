// The agent bridge wire protocol, shared by the extension and the bridge
// (bridge/ bundles this file). Every hop parses with these functions:
// the MCP server, the native host and the service worker. Pure: no chrome.*,
// no Node APIs.

import { LIMITS } from "./validators";

export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_HOST_NAME = "com.orionhud.bridge";

export const BRIDGE_LIMITS = {
  /** One request frame (agent → host → extension). Titles/decisions are small. */
  requestBytes: 16 * 1024,
  /** One response frame. Chrome caps host → extension at 1 MB; the brief is far smaller. */
  responseBytes: 256 * 1024,
  responseText: 200_000,
  errorMessage: 500,
  id: 100,
  token: 128,
  version: 32,
  maxRequestId: 2 ** 31 - 1,
} as const;

export const BRIDGE_METHODS = [
  "get_current_task",
  "list_open_subtasks",
  "add_subtask",
  "complete_task",
  "log_decision",
] as const;
export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

export interface BridgeParamsMap {
  get_current_task: Record<string, never>;
  list_open_subtasks: Record<string, never>;
  add_subtask: { title: string; parent_id?: string };
  complete_task: { task_id: string };
  log_decision: { text: string; task_id?: string };
}

export type BridgeCall = { [M in BridgeMethod]: { method: M; params: BridgeParamsMap[M] } }[BridgeMethod];

export type BridgeRequest = BridgeCall & { v: 1; type: "request"; id: number };

export const BRIDGE_ERROR_CODES = [
  "invalid-request",
  "no-active-task",
  "not-found",
  "out-of-scope",
  "open-children",
  "limit",
  "unavailable",
  "timeout",
  "internal",
] as const;
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export type BridgeResponse =
  | { v: 1; type: "response"; id: number; ok: true; text: string }
  | { v: 1; type: "response"; id: number; ok: false; code: BridgeErrorCode; message: string };

export interface BridgeHello {
  v: 1;
  type: "hello";
  version: string;
}

/** Messages the native host sends to the extension. */
export type HostMessage = BridgeHello | BridgeRequest;

// ─── Helpers ───────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

function isRecord(raw: unknown): raw is Rec {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function onlyKeys(rec: Rec, allowed: readonly string[]): boolean {
  return Object.keys(rec).every((k) => allowed.includes(k));
}

// C0 controls except tab/newline/CR, plus DEL. Never legitimate in a title or decision.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ID_RE = /^[A-Za-z0-9_-]+$/;

function text(raw: unknown, max: number, allowNewlines: boolean): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > max || CONTROL_RE.test(t)) return null;
  if (!allowNewlines && /[\r\n]/.test(t)) return null;
  return t;
}

function taskId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= BRIDGE_LIMITS.id && ID_RE.test(raw) ? raw : null;
}

function requestId(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1 && raw <= BRIDGE_LIMITS.maxRequestId ? raw : null;
}

export function isBridgeMethod(raw: unknown): raw is BridgeMethod {
  return typeof raw === "string" && (BRIDGE_METHODS as readonly string[]).includes(raw);
}

// ─── Parsers ───────────────────────────────────────────────────────────────

/**
 * Validates tool arguments for `method`. Unknown keys are rejected rather
 * than ignored, so a typo like `taskId` fails loudly instead of acting on
 * the wrong task. `undefined` is accepted for tools without arguments
 * (MCP clients may omit `arguments`).
 */
export function parseBridgeCall(method: unknown, rawParams: unknown): BridgeCall | null {
  if (!isBridgeMethod(method)) return null;
  const params = rawParams === undefined ? {} : rawParams;
  if (!isRecord(params)) return null;

  switch (method) {
    case "get_current_task":
    case "list_open_subtasks":
      return Object.keys(params).length === 0 ? { method, params: {} } : null;

    case "add_subtask": {
      if (!onlyKeys(params, ["title", "parent_id"])) return null;
      const title = text(params["title"], LIMITS.taskTitle, false);
      if (!title) return null;
      if (params["parent_id"] === undefined) return { method, params: { title } };
      const parentId = taskId(params["parent_id"]);
      return parentId ? { method, params: { title, parent_id: parentId } } : null;
    }

    case "complete_task": {
      if (!onlyKeys(params, ["task_id"])) return null;
      const id = taskId(params["task_id"]);
      return id ? { method, params: { task_id: id } } : null;
    }

    case "log_decision": {
      if (!onlyKeys(params, ["text", "task_id"])) return null;
      const body = text(params["text"], LIMITS.noteContent, true);
      if (!body) return null;
      if (params["task_id"] === undefined) return { method, params: { text: body } };
      const id = taskId(params["task_id"]);
      return id ? { method, params: { text: body, task_id: id } } : null;
    }
  }
}

export function parseBridgeRequest(raw: unknown): BridgeRequest | null {
  if (!isRecord(raw) || !onlyKeys(raw, ["v", "type", "id", "method", "params"])) return null;
  if (raw["v"] !== BRIDGE_PROTOCOL_VERSION || raw["type"] !== "request") return null;
  const id = requestId(raw["id"]);
  if (id === null) return null;
  const call = parseBridgeCall(raw["method"], raw["params"]);
  return call ? ({ v: 1, type: "request", id, ...call } as BridgeRequest) : null;
}

export function parseBridgeResponse(raw: unknown): BridgeResponse | null {
  if (!isRecord(raw) || raw["v"] !== BRIDGE_PROTOCOL_VERSION || raw["type"] !== "response") return null;
  const id = requestId(raw["id"]);
  if (id === null) return null;
  if (raw["ok"] === true) {
    if (!onlyKeys(raw, ["v", "type", "id", "ok", "text"])) return null;
    const t = raw["text"];
    if (typeof t !== "string" || t.length > BRIDGE_LIMITS.responseText) return null;
    return { v: 1, type: "response", id, ok: true, text: t };
  }
  if (raw["ok"] === false) {
    if (!onlyKeys(raw, ["v", "type", "id", "ok", "code", "message"])) return null;
    const code = BRIDGE_ERROR_CODES.find((c) => c === raw["code"]);
    const message = raw["message"];
    if (!code || typeof message !== "string" || message.length > BRIDGE_LIMITS.errorMessage) return null;
    return { v: 1, type: "response", id, ok: false, code, message };
  }
  return null;
}

/** What the extension accepts from the native host. */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (isRecord(raw) && raw["type"] === "hello") {
    if (!onlyKeys(raw, ["v", "type", "version"]) || raw["v"] !== BRIDGE_PROTOCOL_VERSION) return null;
    const version = raw["version"];
    if (typeof version !== "string" || !/^[0-9A-Za-z.+-]{1,32}$/.test(version)) return null;
    return { v: 1, type: "hello", version };
  }
  return parseBridgeRequest(raw);
}

export function errorResponse(id: number, code: BridgeErrorCode, message: string): BridgeResponse {
  return { v: 1, type: "response", id, ok: false, code, message: message.slice(0, BRIDGE_LIMITS.errorMessage) };
}

export function okResponse(id: number, body: string): BridgeResponse {
  return { v: 1, type: "response", id, ok: true, text: body.slice(0, BRIDGE_LIMITS.responseText) };
}

// ─── Status shown in Settings (chrome.storage.session) ─────────────────────

export type BridgeState = "off" | "connecting" | "connected" | "not-installed" | "forbidden" | "error";

export interface BridgeStatus {
  state: BridgeState;
  detail: string | null;
  hostVersion: string | null;
  at: number;
}

const STATES: BridgeState[] = ["off", "connecting", "connected", "not-installed", "forbidden", "error"];

export function parseBridgeStatus(raw: unknown): BridgeStatus | null {
  if (!isRecord(raw)) return null;
  const state = STATES.find((s) => s === raw["state"]);
  const at = raw["at"];
  if (!state || typeof at !== "number") return null;
  const detail = typeof raw["detail"] === "string" ? raw["detail"].slice(0, 300) : null;
  const hostVersion = typeof raw["hostVersion"] === "string" ? raw["hostVersion"].slice(0, BRIDGE_LIMITS.version) : null;
  return { state, detail, hostVersion, at };
}

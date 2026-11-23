import { describe, expect, it } from "vitest";
import {
  parseBridgeCall,
  parseBridgeRequest,
  parseBridgeResponse,
  parseBridgeStatus,
  parseHostMessage,
} from "../src/shared/bridgeProtocol";
import { parseExtensionMessage } from "../src/shared/messages";

const req = (method: string, params: unknown, extra: Record<string, unknown> = {}) => ({
  v: 1,
  type: "request",
  id: 7,
  method,
  params,
  ...extra,
});

describe("parseBridgeCall", () => {
  it("accepts each tool's valid arguments", () => {
    expect(parseBridgeCall("get_current_task", undefined)).toEqual({ method: "get_current_task", params: {} });
    expect(parseBridgeCall("list_open_subtasks", {})).toEqual({ method: "list_open_subtasks", params: {} });
    expect(parseBridgeCall("add_subtask", { title: "  Write test  " })).toEqual({ method: "add_subtask", params: { title: "Write test" } });
    expect(parseBridgeCall("add_subtask", { title: "x", parent_id: "a-1_B" })).toEqual({
      method: "add_subtask",
      params: { title: "x", parent_id: "a-1_B" },
    });
    expect(parseBridgeCall("complete_task", { task_id: "abc" })).toEqual({ method: "complete_task", params: { task_id: "abc" } });
    expect(parseBridgeCall("log_decision", { text: "Use retries.\nMax 3." })).toEqual({
      method: "log_decision",
      params: { text: "Use retries.\nMax 3." },
    });
  });

  it.each<[string, unknown]>([
    ["delete_task", {}], // not a tool
    ["__proto__", {}],
    ["get_current_task", { extra: 1 }], // no-arg tools take no args
    ["get_current_task", []],
    ["get_current_task", null],
    ["list_open_subtasks", "x"],
    ["add_subtask", {}],
    ["add_subtask", { title: "" }],
    ["add_subtask", { title: "   " }],
    ["add_subtask", { title: 5 }],
    ["add_subtask", { title: "x".repeat(201) }],
    ["add_subtask", { title: "two\nlines" }], // titles are one line
    ["add_subtask", { title: "nul\u0000byte" }],
    ["add_subtask", { title: "bell\u0007" }],
    ["add_subtask", { title: "ok", parentId: "camelCase typo" }], // unknown key
    ["add_subtask", { title: "ok", parent_id: "" }],
    ["add_subtask", { title: "ok", parent_id: "../etc" }],
    ["add_subtask", { title: "ok", parent_id: "x".repeat(101) }],
    ["add_subtask", { title: "ok", parent_id: 12 }],
    ["add_subtask", { title: "ok", parent_id: null }],
    ["complete_task", {}],
    ["complete_task", { task_id: "a b" }],
    ["complete_task", { task_id: "a", cascade: true }], // no cascade over the bridge
    ["log_decision", { text: "" }],
    ["log_decision", { text: "x".repeat(501) }],
    ["log_decision", { text: "esc\u001b[31m" }],
    ["log_decision", { text: "ok", task_id: "<script>" }],
  ])("rejects %s %j", (method, params) => {
    expect(parseBridgeCall(method, params)).toBeNull();
  });
});

describe("parseBridgeRequest", () => {
  it("accepts a well-formed request", () => {
    expect(parseBridgeRequest(req("complete_task", { task_id: "t1" }))).toEqual(req("complete_task", { task_id: "t1" }));
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["array", [req("get_current_task", {})]],
    ["string", "get_current_task"],
    ["wrong version", req("get_current_task", {}, { v: 2 })],
    ["missing version", { type: "request", id: 1, method: "get_current_task", params: {} }],
    ["wrong type", req("get_current_task", {}, { type: "response" })],
    ["id zero", req("get_current_task", {}, { id: 0 })],
    ["negative id", req("get_current_task", {}, { id: -1 })],
    ["fractional id", req("get_current_task", {}, { id: 1.5 })],
    ["string id", req("get_current_task", {}, { id: "1" })],
    ["huge id", req("get_current_task", {}, { id: 2 ** 40 })],
    ["extra top-level key", req("get_current_task", {}, { storage: "dump" })],
    ["bad params", req("add_subtask", { title: "" })],
  ])("rejects %s", (_label, raw) => {
    expect(parseBridgeRequest(raw)).toBeNull();
  });
});

describe("parseBridgeResponse", () => {
  it("accepts ok and error responses", () => {
    expect(parseBridgeResponse({ v: 1, type: "response", id: 3, ok: true, text: "hi" })).toEqual({
      v: 1, type: "response", id: 3, ok: true, text: "hi",
    });
    expect(parseBridgeResponse({ v: 1, type: "response", id: 3, ok: false, code: "not-found", message: "gone" })).toEqual({
      v: 1, type: "response", id: 3, ok: false, code: "not-found", message: "gone",
    });
  });

  it.each<[string, unknown]>([
    ["no ok", { v: 1, type: "response", id: 3, text: "hi" }],
    ["ok not boolean", { v: 1, type: "response", id: 3, ok: "true", text: "hi" }],
    ["text not string", { v: 1, type: "response", id: 3, ok: true, text: { raw: "storage" } }],
    ["raw storage attached", { v: 1, type: "response", id: 3, ok: true, text: "hi", workflow: {} }],
    ["text too long", { v: 1, type: "response", id: 3, ok: true, text: "x".repeat(200_001) }],
    ["unknown error code", { v: 1, type: "response", id: 3, ok: false, code: "pwned", message: "x" }],
    ["message too long", { v: 1, type: "response", id: 3, ok: false, code: "internal", message: "x".repeat(501) }],
    ["bad id", { v: 1, type: "response", id: "3", ok: true, text: "hi" }],
  ])("rejects %s", (_label, raw) => {
    expect(parseBridgeResponse(raw)).toBeNull();
  });
});

describe("parseHostMessage", () => {
  it("accepts hello and requests", () => {
    expect(parseHostMessage({ v: 1, type: "hello", version: "0.3.0" })).toEqual({ v: 1, type: "hello", version: "0.3.0" });
    expect(parseHostMessage(req("get_current_task", {}))?.type).toBe("request");
  });

  it.each<unknown>([
    { v: 1, type: "hello", version: "<img src=x>" },
    { v: 1, type: "hello", version: "x".repeat(33) },
    { v: 1, type: "hello", version: "1", extra: true },
    { v: 1, type: "response", id: 1, ok: true, text: "x" }, // the host never sends responses
  ])("rejects %j", (raw) => {
    expect(parseHostMessage(raw)).toBeNull();
  });
});

describe("parseBridgeStatus", () => {
  it("accepts a status and rejects junk", () => {
    expect(parseBridgeStatus({ state: "connected", detail: null, hostVersion: "0.3.0", at: 1 })?.state).toBe("connected");
    expect(parseBridgeStatus({ state: "pwned", at: 1 })).toBeNull();
    expect(parseBridgeStatus({ state: "off" })).toBeNull();
    expect(parseBridgeStatus(null)).toBeNull();
  });
});

describe("ORION_BRIDGE_CONNECT message", () => {
  it("is accepted bare and rejected with payload", () => {
    expect(parseExtensionMessage({ type: "ORION_BRIDGE_CONNECT" })).toEqual({ type: "ORION_BRIDGE_CONNECT" });
    expect(parseExtensionMessage({ type: "ORION_BRIDGE_CONNECT", host: "evil" })).toBeNull();
    expect(parseExtensionMessage({ type: "ORION_STATE_CHANGED", reason: "bridge" })).toEqual({ type: "ORION_STATE_CHANGED", reason: "bridge" });
  });
});

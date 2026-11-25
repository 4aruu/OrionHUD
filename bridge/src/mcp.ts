// A minimal MCP server over stdio: newline-delimited JSON-RPC 2.0 with
// initialize, ping, tools/list and tools/call. Hand-rolled instead of the
// SDK to keep the bridge free of runtime dependencies (supply chain) and
// small enough to audit in one sitting.

import { parseBridgeCall } from "../../src/shared/bridgeProtocol";
import type { CallBridge } from "./client";
import { TOOLS } from "./tools";
import { BRIDGE_VERSION } from "./version";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_LINE_BYTES = 1024 * 1024;

type JsonRpcId = string | number;

interface RpcError {
  code: number;
  message: string;
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

export interface McpOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  call: CallBridge;
  log?: (line: string) => void;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function isId(x: unknown): x is JsonRpcId {
  return (typeof x === "string" && x.length <= 200) || (typeof x === "number" && Number.isFinite(x));
}

export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : (SUPPORTED_PROTOCOL_VERSIONS[0] as string);
}

export async function handleRpc(msg: unknown, call: CallBridge): Promise<unknown | null> {
  if (!isRecord(msg) || msg["jsonrpc"] !== "2.0" || typeof msg["method"] !== "string") {
    const id = isRecord(msg) && isId(msg["id"]) ? msg["id"] : null;
    return { jsonrpc: "2.0", id, error: { code: INVALID_REQUEST, message: "Invalid request" } };
  }
  const method = msg["method"];
  // Notifications (no id) never get a response.
  if (!("id" in msg)) return null;
  const id = msg["id"];
  if (!isId(id)) return { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Invalid id" } };
  const params = isRecord(msg["params"]) ? msg["params"] : {};
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (error: RpcError) => ({ jsonrpc: "2.0", id, error });

  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: negotiateVersion(params["protocolVersion"]),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "orionhud", title: "Orion Waypoint", version: BRIDGE_VERSION },
        instructions:
          "Orion Waypoint holds the user's plan. Call get_current_task at the start to learn what they're working on. Check off subtasks with complete_task and record decisions with log_decision as you go.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = params["name"];
      if (!TOOLS.some((t) => t.name === name)) return fail({ code: INVALID_PARAMS, message: `Unknown tool: ${String(name).slice(0, 60)}` });
      const parsed = parseBridgeCall(name, params["arguments"]);
      if (!parsed) {
        return ok({
          content: [{ type: "text", text: "Invalid arguments. Check the tool's input schema (ids come from list_open_subtasks)." }],
          isError: true,
        });
      }
      const res = await call(parsed);
      return ok(
        res.ok
          ? { content: [{ type: "text", text: res.text }], isError: false }
          : { content: [{ type: "text", text: res.message }], isError: true }
      );
    }
    default:
      return fail({ code: METHOD_NOT_FOUND, message: "Method not found" });
  }
}

/** Runs until input ends. Resolves after in-flight calls have been answered. */
export function runMcpServer(opts: McpOptions): Promise<void> {
  const log = opts.log ?? (() => undefined);
  const send = (msg: unknown) => opts.output.write(`${JSON.stringify(msg)}\n`);
  const inflight = new Set<Promise<void>>();
  let buf = "";
  let discarding = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error" } });
      return;
    }
    const p = handleRpc(msg, opts.call)
      .then((res) => {
        if (res !== null) send(res);
      })
      .catch((err: unknown) => log(`internal error: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => inflight.delete(p));
    inflight.add(p);
  };

  return new Promise((resolve) => {
    opts.input.setEncoding?.("utf8");
    opts.input.on("data", (chunk: string | Buffer) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (discarding) {
          discarding = false;
          continue;
        }
        handleLine(line);
      }
      if (buf.length > MAX_LINE_BYTES) {
        log("dropping an oversized message");
        send({ jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Message too large" } });
        buf = "";
        discarding = true;
      }
    });
    opts.input.on("end", () => {
      if (buf.trim() && !discarding) handleLine(buf);
      void Promise.all([...inflight]).then(() => resolve());
    });
  });
}

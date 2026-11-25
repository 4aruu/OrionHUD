import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { okResponse, type BridgeCall } from "../../src/shared/bridgeProtocol";
import { handleRpc, negotiateVersion, runMcpServer, SUPPORTED_PROTOCOL_VERSIONS } from "../src/mcp";
import { TOOLS } from "../src/tools";

const echo = vi.fn(async (call: BridgeCall) => okResponse(1, `ran ${call.method}`));

describe("MCP JSON-RPC handling", () => {
  it("negotiates the protocol version", async () => {
    expect(negotiateVersion("2025-06-18")).toBe("2025-06-18");
    expect(negotiateVersion("1999-01-01")).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    const res = (await handleRpc(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
      echo
    )) as { result: { protocolVersion: string; capabilities: unknown; serverInfo: { name: string } } };
    expect(res.result.protocolVersion).toBe("2024-11-05");
    expect(res.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(res.result.serverInfo.name).toBe("orionhud");
  });

  it("lists exactly five small tools with closed schemas", async () => {
    const res = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, echo)) as { result: { tools: typeof TOOLS } };
    expect(res.result.tools.map((t) => t.name)).toEqual([
      "get_current_task",
      "list_open_subtasks",
      "add_subtask",
      "complete_task",
      "log_decision",
    ]);
    for (const t of res.result.tools) expect(t.inputSchema["additionalProperties"]).toBe(false);
    // The whole tool list stays tiny (Task Master ships ~21k tokens).
    expect(JSON.stringify(res.result.tools).length).toBeLessThan(4000);
  });

  it("forwards a valid tool call and wraps the text", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_current_task", arguments: {} } }, echo);
    expect(res).toEqual({ jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "ran get_current_task" }], isError: false } });
  });

  it("returns invalid arguments as a tool error without calling the bridge", async () => {
    echo.mockClear();
    const res = (await handleRpc(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "complete_task", arguments: { task_id: "../../x" } } },
      echo
    )) as { result: { isError: boolean } };
    expect(res.result.isError).toBe(true);
    expect(echo).not.toHaveBeenCalled();
  });

  it("rejects unknown tools and methods with JSON-RPC errors", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "delete_everything" } }, echo)).toMatchObject({
      id: 5,
      error: { code: -32602 },
    });
    expect(await handleRpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }, echo)).toMatchObject({ id: 6, error: { code: -32601 } });
  });

  it("never answers notifications, and rejects non-JSON-RPC", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, echo)).toBeNull();
    expect(await handleRpc({ id: 7, method: "ping" }, echo)).toMatchObject({ id: 7, error: { code: -32600 } });
    expect(await handleRpc([{ jsonrpc: "2.0", id: 8, method: "ping" }], echo)).toMatchObject({ id: null, error: { code: -32600 } });
  });
});

describe("runMcpServer over stdio", () => {
  it("handles newline-delimited messages, parse errors and partial lines", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: unknown[] = [];
    let buf = "";
    output.on("data", (c: Buffer) => {
      buf += c.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
      }
    });
    const done = runMcpServer({ input, output, call: echo });
    input.write('{"jsonrpc":"2.0","id":1,"method":"pi');
    input.write('ng"}\n{not json}\n');
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.end('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_open_subtasks"}}\n');
    await done;
    // JSON-RPC responses may arrive in any order; compare by id.
    const key = (x: unknown) => String((x as { id: unknown }).id);
    lines.sort((a, b) => key(a).localeCompare(key(b)));
    expect(lines).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "ran list_open_subtasks" }], isError: false } },
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
    ]);
  });
});

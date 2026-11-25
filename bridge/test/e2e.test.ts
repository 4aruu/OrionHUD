// End to end: an MCP client's JSON-RPC line → MCP server → local socket
// (framed, token-authenticated) → native host → framed "Chrome" pipe → the
// extension's real handler → workflowActions → (fake) IndexedDB, and back.
// Only Chrome itself is simulated: a pair of streams carrying 4-byte frames.

import "fake-indexeddb/auto";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installChromeAlarmsMock } from "../../test/chromeMock";
import { addOutline, createWorkflow, startWorkflow, stopWorkflow } from "../../src/shared/workflowActions";
import { getWorkflow } from "../../src/shared/db";
import { walk } from "../../src/shared/taskTree";
import { parseOutline } from "../../src/shared/outline";
import { handleBridgeRequest } from "../../src/shared/bridgeService";
import { BRIDGE_LIMITS, parseHostMessage } from "../../src/shared/bridgeProtocol";
import type { ITaskNode, IWorkflowState } from "../../src/shared/types";
import { encodeFrame, readFrames } from "../src/framing";
import { createHostClient } from "../src/client";
import { newToken, startHost, type RunningHost } from "../src/host";
import { runMcpServer } from "../src/mcp";

function uniqueSocket(dir: string): string {
  const tag = randomBytes(6).toString("hex");
  return process.platform === "win32" ? `\\\\.\\pipe\\orionhud-test-${tag}` : join(dir, `t-${tag}.sock`);
}

/** Plays Chrome + the service worker: decode frames from the host, run the real handler, answer. */
function fakeExtension(fromHost: PassThrough, toHost: PassThrough) {
  const seen: string[] = [];
  readFrames(
    fromHost,
    BRIDGE_LIMITS.requestBytes,
    (raw) => {
      const msg = parseHostMessage(raw);
      if (!msg) throw new Error(`extension got a malformed message: ${JSON.stringify(raw)}`);
      seen.push(msg.type);
      if (msg.type !== "request") return;
      void handleBridgeRequest(msg).then(({ response }) => toHost.write(encodeFrame(response, BRIDGE_LIMITS.responseBytes)));
    },
    (err) => {
      throw err;
    }
  );
  return seen;
}

/** A tiny MCP client: writes JSON-RPC lines, resolves responses by id. */
function mcpClient(toServer: PassThrough, fromServer: PassThrough) {
  const waiting = new Map<number, (v: unknown) => void>();
  let buf = "";
  let id = 0;
  fromServer.on("data", (c: Buffer) => {
    buf += c.toString("utf8");
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)) as { id: number };
      buf = buf.slice(i + 1);
      waiting.get(msg.id)?.(msg);
    }
  });
  const request = (method: string, params?: unknown) =>
    new Promise<any>((resolve) => {
      const n = ++id;
      waiting.set(n, resolve);
      toServer.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, ...(params ? { params } : {}) })}\n`);
    });
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await request("tools/call", { name, arguments: args });
    return res.result as { content: { type: string; text: string }[]; isError: boolean };
  };
  return { request, tool };
}

function find(nodes: ITaskNode[], title: string): ITaskNode {
  let hit: ITaskNode | null = null;
  walk(nodes, (n) => {
    if (!hit && n.title === title) hit = n;
  });
  if (!hit) throw new Error(`no task ${title}`);
  return hit;
}

describe("bridge end to end", () => {
  let dir: string;
  let host: RunningHost;
  let socket: string;
  let token: string;
  let wf: IWorkflowState;
  let extensionSaw: string[];
  let client: ReturnType<typeof mcpClient>;
  let mcpIn: PassThrough;

  beforeEach(async () => {
    installChromeAlarmsMock();
    await stopWorkflow();
    wf = await createWorkflow("Payments", 5);
    await addOutline(wf.id, null, parseOutline("- Token refresh\n  - Write retry test\n  - Handle 401\n- Elsewhere"));
    wf = (await getWorkflow(wf.id)) as IWorkflowState;
    await startWorkflow(wf.id, find(wf.rootNodes, "Token refresh").id);

    dir = mkdtempSync(join(tmpdir(), "orion-e2e-"));
    socket = uniqueSocket(dir);
    token = newToken();
    const chromeToHost = new PassThrough();
    const hostToChrome = new PassThrough();
    extensionSaw = fakeExtension(hostToChrome, chromeToHost);
    host = await startHost({ input: chromeToHost, output: hostToChrome, socketPath: socket, token, requestTimeoutMs: 3000 });

    mcpIn = new PassThrough();
    const mcpOut = new PassThrough();
    void runMcpServer({ input: mcpIn, output: mcpOut, call: createHostClient(async () => ({ socket, token }), 3000) });
    client = mcpClient(mcpIn, mcpOut);
    await client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  });

  afterEach(async () => {
    mcpIn.end();
    await host.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("an agent reads the brief, completes a subtask and logs a decision; storage reflects it", async () => {
    expect(extensionSaw[0]).toBe("hello");

    const brief = await client.tool("get_current_task");
    expect(brief.isError).toBe(false);
    expect(brief.content[0]?.text).toMatch(/^# Context: Payments/);
    expect(brief.content[0]?.text).toContain("- [ ] Write retry test");

    const list = await client.tool("list_open_subtasks");
    const leafId = /Write retry test · id: ([\w-]+)/.exec(list.content[0]?.text ?? "")?.[1];
    expect(leafId).toBeTruthy();

    const done = await client.tool("complete_task", { task_id: leafId });
    expect(done.isError).toBe(false);
    expect(done.content[0]?.text).toContain("Completed “Write retry test”");

    const added = await client.tool("add_subtask", { title: "Add jitter" });
    expect(added.isError).toBe(false);
    const decided = await client.tool("log_decision", { text: "Exponential backoff, cap 30 s" });
    expect(decided.isError).toBe(false);

    const after = (await getWorkflow(wf.id)) as IWorkflowState;
    expect(find(after.rootNodes, "Write retry test").status).toBe("DONE");
    const current = find(after.rootNodes, "Token refresh");
    expect(current.subTasks.map((t) => t.title)).toEqual(["Write retry test", "Handle 401", "Add jitter"]);
    expect(current.microNotes.map((n) => [n.kind, n.content])).toEqual([["decision", "Exponential backoff, cap 30 s"]]);
    expect(find(after.rootNodes, "Elsewhere").status).toBe("PENDING");
  });

  it("surfaces scope errors to the agent as tool errors", async () => {
    const elsewhere = find(wf.rootNodes, "Elsewhere");
    const res = await client.tool("complete_task", { task_id: elsewhere.id });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("list_open_subtasks");
    expect(find(((await getWorkflow(wf.id)) as IWorkflowState).rootNodes, "Elsewhere").status).toBe("PENDING");
  });

  it("rejects a socket client with the wrong token, and nothing reaches the extension", async () => {
    const before = extensionSaw.length;
    const wrong = createHostClient(async () => ({ socket, token: "0".repeat(64) }), 3000);
    const res = await wrong({ method: "get_current_task", params: {} });
    expect(res).toMatchObject({ ok: false, code: "unavailable" });
    expect(extensionSaw.length).toBe(before);
  });

  it("drops a socket client that sends an oversized frame", async () => {
    const closed = await new Promise<boolean>((resolve) => {
      const s = createConnection(socket);
      s.on("connect", () => {
        const header = Buffer.alloc(4);
        header.writeUInt32LE(BRIDGE_LIMITS.requestBytes + 1, 0);
        s.write(header);
      });
      s.on("close", () => resolve(true));
      s.on("error", () => undefined);
    });
    expect(closed).toBe(true);
  });

  it("reports the bridge as unavailable when no host is running", async () => {
    await host.close();
    const res = await client.tool("get_current_task");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("isn't reachable");
  });
});

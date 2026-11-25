// MCP server → native host. One short connection per tool call: the host
// can restart (extension reload) with a new token at any time, so we read
// the session file fresh every call instead of caching a connection.

import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import {
  BRIDGE_LIMITS,
  errorResponse,
  parseBridgeResponse,
  type BridgeCall,
  type BridgeResponse,
} from "../../src/shared/bridgeProtocol";
import { encodeFrame, readFrames } from "./framing";

export interface Session {
  socket: string;
  token: string;
}

export function parseSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const socket = rec["socket"];
  const token = rec["token"];
  if (typeof socket !== "string" || socket.length > 1024) return null;
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  return { socket, token };
}

export async function readSession(path: string): Promise<Session | null> {
  try {
    return parseSession(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

export const UNAVAILABLE =
  "OrionHUD isn't reachable. Ask the user to open Chrome with OrionHUD and check that Settings → Agent bridge says Connected.";

export type CallBridge = (call: BridgeCall) => Promise<BridgeResponse>;

export function createHostClient(getSession: () => Promise<Session | null>, timeoutMs = 20_000): CallBridge {
  let nextId = 1;
  return async (call) => {
    const id = nextId;
    nextId = nextId >= BRIDGE_LIMITS.maxRequestId ? 1 : nextId + 1;
    const session = await getSession();
    if (!session) return errorResponse(id, "unavailable", UNAVAILABLE);

    return new Promise<BridgeResponse>((resolve) => {
      let finished = false;
      const socket = createConnection(session.socket);
      const finish = (res: BridgeResponse) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(res);
      };
      const timer = setTimeout(() => finish(errorResponse(id, "timeout", "OrionHUD didn't answer in time.")), timeoutMs);

      socket.once("error", () => finish(errorResponse(id, "unavailable", UNAVAILABLE)));
      socket.once("close", () => finish(errorResponse(id, "unavailable", UNAVAILABLE)));
      readFrames(
        socket,
        BRIDGE_LIMITS.responseBytes,
        (raw) => {
          const res = parseBridgeResponse(raw);
          if (res && res.id === id) finish(res);
        },
        () => finish(errorResponse(id, "internal", "The bridge sent a malformed reply."))
      );
      socket.once("connect", () => {
        socket.write(encodeFrame({ v: 1, type: "auth", token: session.token }, BRIDGE_LIMITS.requestBytes));
        socket.write(encodeFrame({ v: 1, type: "request", id, ...call }, BRIDGE_LIMITS.requestBytes));
      });
    });
  };
}

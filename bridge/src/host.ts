// The native-messaging host. Chrome starts it when the extension calls
// connectNative, and stops it (closes stdin) when the port closes.
//
// It listens on a per-user local socket for MCP servers, checks each one's
// token, re-validates every request, forwards it to the extension over
// stdout, and routes the answer back. It never touches storage itself.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import {
  BRIDGE_LIMITS,
  errorResponse,
  parseBridgeRequest,
  parseBridgeResponse,
  type BridgeRequest,
  type BridgeResponse,
} from "../../src/shared/bridgeProtocol";
import { encodeFrame, readFrames } from "./framing";
import { extensionOrigin, readInstallConfig, writeFileAtomic } from "./install";
import { bridgeFiles, currentPlatform } from "./paths";
import { BRIDGE_VERSION } from "./version";

export interface HostOptions {
  /** From Chrome. */
  input: NodeJS.ReadableStream;
  /** To Chrome. Only frames may ever be written here. */
  output: NodeJS.WritableStream;
  socketPath: string;
  token: string;
  requestTimeoutMs?: number;
  authTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface RunningHost {
  /** Resolves once Chrome closes the pipe or close() is called. */
  done: Promise<void>;
  close(): Promise<void>;
}

const MAX_PENDING = 64;
const MAX_PENDING_PER_CLIENT = 8;

interface Pending {
  client: Client;
  clientId: number;
  timer: NodeJS.Timeout;
}

interface Client {
  socket: Socket;
  authed: boolean;
  inflight: number;
}

export function parseAuth(raw: unknown, token: string): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const rec = raw as Record<string, unknown>;
  const given = rec["token"];
  if (rec["v"] !== 1 || rec["type"] !== "auth" || typeof given !== "string" || given.length > BRIDGE_LIMITS.token) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(token, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function startHost(opts: HostOptions): Promise<RunningHost> {
  const log = opts.log ?? (() => undefined);
  const requestTimeoutMs = opts.requestTimeoutMs ?? 15_000;
  const authTimeoutMs = opts.authTimeoutMs ?? 3_000;
  const pending = new Map<number, Pending>();
  const clients = new Set<Client>();
  let nextId = 1;
  let closed = false;

  const toChrome = (msg: unknown) => {
    if (!closed) opts.output.write(encodeFrame(msg, BRIDGE_LIMITS.requestBytes));
  };
  const toClient = (client: Client, msg: BridgeResponse) => {
    if (!client.socket.destroyed) client.socket.write(encodeFrame(msg, BRIDGE_LIMITS.responseBytes));
  };
  const settle = (hostId: number, build: (clientId: number) => BridgeResponse) => {
    const p = pending.get(hostId);
    if (!p) return;
    pending.delete(hostId);
    clearTimeout(p.timer);
    p.client.inflight--;
    toClient(p.client, build(p.clientId));
  };

  const forward = (client: Client, req: BridgeRequest) => {
    if (pending.size >= MAX_PENDING || client.inflight >= MAX_PENDING_PER_CLIENT) {
      toClient(client, errorResponse(req.id, "limit", "Too many requests in flight. Wait for earlier ones to finish."));
      return;
    }
    const hostId = nextId;
    nextId = nextId >= BRIDGE_LIMITS.maxRequestId ? 1 : nextId + 1;
    const timer = setTimeout(
      () => settle(hostId, (id) => errorResponse(id, "timeout", "OrionHUD didn't answer in time. Is Chrome busy or asleep?")),
      requestTimeoutMs
    );
    client.inflight++;
    pending.set(hostId, { client, clientId: req.id, timer });
    toChrome({ ...req, id: hostId });
  };

  const onClient = (socket: Socket) => {
    const client: Client = { socket, authed: false, inflight: 0 };
    clients.add(client);
    const authTimer = setTimeout(() => socket.destroy(), authTimeoutMs);
    const drop = () => {
      clearTimeout(authTimer);
      socket.destroy();
    };
    readFrames(
      socket,
      BRIDGE_LIMITS.requestBytes,
      (raw) => {
        if (!client.authed) {
          if (!parseAuth(raw, opts.token)) {
            log("rejected a client with a bad token");
            drop();
            return;
          }
          client.authed = true;
          clearTimeout(authTimer);
          return;
        }
        const req = parseBridgeRequest(raw);
        if (!req) {
          // Out of protocol: answer if we can tell the id, then hang up.
          const id = (raw as { id?: unknown } | null)?.id;
          if (typeof id === "number" && Number.isSafeInteger(id) && id >= 1 && id <= BRIDGE_LIMITS.maxRequestId) {
            toClient(client, errorResponse(id, "invalid-request", "Malformed request."));
          }
          socket.end();
          return;
        }
        forward(client, req);
      },
      () => drop()
    );
    socket.on("error", () => undefined);
    socket.on("close", () => {
      clearTimeout(authTimer);
      clients.delete(client);
      for (const [hostId, p] of pending) {
        if (p.client === client) {
          clearTimeout(p.timer);
          pending.delete(hostId);
        }
      }
    });
  };

  const server = await listen(opts.socketPath, onClient, log);

  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => (resolveDone = r));

  const close = async () => {
    if (closed) return done;
    closed = true;
    for (const [hostId] of pending) settle(hostId, (id) => errorResponse(id, "unavailable", "OrionHUD closed the bridge."));
    for (const c of clients) c.socket.destroy();
    await new Promise<void>((r) => server.close(() => r()));
    resolveDone();
    return done;
  };

  const reader = readFrames(
    opts.input,
    BRIDGE_LIMITS.responseBytes,
    (raw) => {
      const res = parseBridgeResponse(raw);
      if (!res) {
        log("ignored a malformed message from the extension");
        return;
      }
      settle(res.id, (id) => ({ ...res, id }));
    },
    () => {
      log("bad frame from the extension; closing");
      void close();
    }
  );
  opts.input.on("end", () => void close());
  opts.input.on("close", () => void close());
  void done.then(() => reader.stop());

  toChrome({ v: 1, type: "hello", version: BRIDGE_VERSION });
  return { done, close };
}

/** True if something is accepting connections at path. */
function probe(path: string): Promise<boolean> {
  return new Promise((ok) => {
    const s = createConnection(path);
    s.once("connect", () => {
      s.destroy();
      ok(true);
    });
    s.once("error", () => ok(false));
  });
}

async function listen(path: string, onClient: (s: Socket) => void, log: (l: string) => void): Promise<Server> {
  // A previous host may still be shutting down (extension reload): wait briefly.
  for (let attempt = 0; ; attempt++) {
    const server = createServer(onClient);
    try {
      await new Promise<void>((ok, fail) => {
        server.once("error", fail);
        server.listen(path, () => {
          server.off("error", fail);
          ok();
        });
      });
      server.on("error", (e) => log(`socket error: ${e.message}`));
      return server;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw err;
      if (process.platform !== "win32" && !(await probe(path))) {
        await unlink(path).catch(() => undefined); // stale socket file from a crash
        continue;
      }
      if (attempt >= 10) throw new Error("Another OrionHUD bridge host is already running (another Chrome profile?).");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

/** Entry point when Chrome launches us. */
export async function runNativeHost(args: string[]): Promise<number> {
  const log = (line: string) => process.stderr.write(`orionhud-bridge: ${line}\n`);
  const files = bridgeFiles(currentPlatform());
  const config = await readInstallConfig(files);
  if (!config) {
    log("not installed; run `orionhud-bridge install --extension-id <id>`");
    return 1;
  }
  // Chrome passes the caller's origin as the first argument. allowed_origins
  // already enforces this; checking again costs nothing.
  const origin = args.find((a) => a.startsWith("chrome-extension://"));
  if (origin !== extensionOrigin(config.extensionId)) {
    log("refusing a caller that isn't the installed OrionHUD extension");
    return 1;
  }

  const token = newToken();
  let host: RunningHost;
  try {
    host = await startHost({ input: process.stdin, output: process.stdout, socketPath: files.socket, token, log });
  } catch (err) {
    log(err instanceof Error ? err.message : "couldn't start");
    return 1;
  }
  await writeFileAtomic(files.session, JSON.stringify({ v: 1, socket: files.socket, token, pid: process.pid }));

  const cleanup = async () => {
    await rm(files.session, { force: true }).catch(() => undefined);
    if (process.platform !== "win32" && existsSync(files.socket)) await unlink(files.socket).catch(() => undefined);
  };
  process.once("SIGTERM", () => void host.close());
  process.once("SIGINT", () => void host.close());
  await host.done;
  await cleanup();
  return 0;
}

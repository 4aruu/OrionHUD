import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeStatus } from "../src/shared/bridgeProtocol";

// Chrome reports a missing host by disconnecting the port almost at once,
// often before an awaited storage write finishes. Found by the Playwright
// bridge test: the listener used to be attached too late, so the panel stayed
// on "Connecting…" and "Check again" did nothing.

type Listener = () => void;

function installChrome(lastError: string) {
  const statuses: BridgeStatus[] = [];
  const connectNative = vi.fn(() => {
    const disconnect: Listener[] = [];
    const port = {
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: (l: Listener) => disconnect.push(l) },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    };
    // Fire on the next macrotask, like Chrome does for "host not found".
    setTimeout(() => {
      runtime.lastError = { message: lastError };
      disconnect.forEach((l) => l());
      runtime.lastError = undefined;
    }, 0);
    return port;
  });
  const runtime: { lastError?: { message: string }; connectNative: typeof connectNative; sendMessage: () => Promise<void> } = {
    connectNative,
    sendMessage: () => Promise.resolve(),
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime,
    permissions: { contains: () => Promise.resolve(true) },
    alarms: { create: vi.fn(), clear: vi.fn(() => Promise.resolve(true)) },
    storage: {
      session: {
        // Slower than the disconnect, which is what exposed the race.
        set: (items: Record<string, BridgeStatus>) =>
          new Promise<void>((ok) =>
            setTimeout(() => {
              statuses.push(...Object.values(items));
              ok();
            }, 5)
          ),
      },
    },
  };
  return { statuses, connectNative };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe("connectBridge", () => {
  beforeEach(() => vi.resetModules());

  it("records not-installed when the host is missing, even if Chrome disconnects immediately", async () => {
    const { statuses } = installChrome("Specified native messaging host not found.");
    const { connectBridge } = await import("../src/background/bridge");
    await connectBridge();
    await settle();
    expect(statuses.at(-1)?.state).toBe("not-installed");
  });

  it("lets Check again retry after a failed attempt", async () => {
    const { connectNative } = installChrome("Specified native messaging host not found.");
    const { connectBridge } = await import("../src/background/bridge");
    await connectBridge();
    await settle();
    await connectBridge();
    await settle();
    expect(connectNative).toHaveBeenCalledTimes(2);
  });

  it("records forbidden for a host installed for another extension", async () => {
    const { statuses } = installChrome("Access to the specified native messaging host is forbidden.");
    const { connectBridge } = await import("../src/background/bridge");
    await connectBridge();
    await settle();
    expect(statuses.at(-1)?.state).toBe("forbidden");
  });
});

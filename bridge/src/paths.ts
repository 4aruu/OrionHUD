// Where the bridge keeps its files, per platform. Everything is per-user;
// nothing needs admin rights.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { BRIDGE_HOST_NAME } from "../../src/shared/bridgeProtocol";

export interface PlatformEnv {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
}

/** Stable per-user folder: bundle copy, launcher, config, session token, socket. */
export function dataDir({ platform, home, env }: PlatformEnv): string {
  if (platform === "win32") return join(env["LOCALAPPDATA"] || join(home, "AppData", "Local"), "OrionHUD", "bridge");
  if (platform === "darwin") return join(home, "Library", "Application Support", "OrionHUD", "bridge");
  return join(env["XDG_DATA_HOME"] || join(home, ".local", "share"), "orionhud", "bridge");
}

/** Folder Chrome scans for user-level host manifests; null on Windows (registry instead). */
export function manifestDir({ platform, home, env }: PlatformEnv): string | null {
  if (platform === "win32") return null;
  if (platform === "darwin") return join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  return join(env["XDG_CONFIG_HOME"] || join(home, ".config"), "google-chrome", "NativeMessagingHosts");
}

export const WINDOWS_REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${BRIDGE_HOST_NAME}`;

/** Named pipe on Windows (per-user name), unix socket in the 0700 data dir elsewhere. */
export function socketPath(dir: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    const tag = createHash("sha256").update(dir.toLowerCase()).digest("hex").slice(0, 16);
    return `\\\\.\\pipe\\orionhud-bridge-${tag}`;
  }
  return join(dir, "bridge.sock");
}

export interface BridgeFiles {
  dir: string;
  bundle: string;
  launcher: string;
  config: string;
  session: string;
  socket: string;
  manifest: string;
}

export function bridgeFiles(p: PlatformEnv): BridgeFiles {
  const dir = dataDir(p);
  const mdir = manifestDir(p);
  return {
    dir,
    bundle: join(dir, "orion-bridge.mjs"),
    launcher: join(dir, p.platform === "win32" ? "orion-bridge-host.bat" : "orion-bridge-host.sh"),
    config: join(dir, "config.json"),
    session: join(dir, "session.json"),
    socket: socketPath(dir, p.platform),
    manifest: join(mdir ?? dir, `${BRIDGE_HOST_NAME}.json`),
  };
}

export function currentPlatform(): PlatformEnv {
  return {
    platform: process.platform,
    home: process.env["HOME"] || process.env["USERPROFILE"] || "",
    env: process.env,
  };
}

// install / uninstall / status. Registers the native-messaging host for
// Chrome so that only the given extension ID can launch it.

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BRIDGE_HOST_NAME } from "../../src/shared/bridgeProtocol";
import { WINDOWS_REGISTRY_KEY, bridgeFiles, type BridgeFiles, type PlatformEnv } from "./paths";

/** Chrome extension IDs are 32 characters a–p. */
export function parseExtensionId(raw: unknown): string | null {
  return typeof raw === "string" && /^[a-p]{32}$/.test(raw) ? raw : null;
}

export function extensionOrigin(id: string): string {
  return `chrome-extension://${id}/`;
}

export interface HostManifest {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export function buildHostManifest(launcherPath: string, extensionId: string): HostManifest {
  return {
    name: BRIDGE_HOST_NAME,
    description: "OrionHUD agent bridge",
    path: launcherPath,
    type: "stdio",
    allowed_origins: [extensionOrigin(extensionId)],
  };
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The script Chrome runs. Absolute node path: Chrome started from a GUI has no useful PATH. */
export function buildLauncher(platform: NodeJS.Platform, nodePath: string, bundlePath: string): string {
  if (platform === "win32") {
    // cmd.exe has no safe escaping for these inside quotes.
    for (const p of [nodePath, bundlePath]) {
      if (/["%^&|<>\r\n]/.test(p)) throw new Error(`Can't install from a path containing special characters: ${p}`);
    }
    return `@echo off\r\n"${nodePath}" "${bundlePath}" native-host %*\r\n`;
  }
  return `#!/bin/sh\nexec ${shQuote(nodePath)} ${shQuote(bundlePath)} native-host "$@"\n`;
}

export interface InstallConfig {
  extensionId: string;
}

export function parseInstallConfig(raw: unknown): InstallConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const id = parseExtensionId((raw as Record<string, unknown>)["extensionId"]);
  return id ? { extensionId: id } : null;
}

export async function readInstallConfig(files: BridgeFiles): Promise<InstallConfig | null> {
  try {
    return parseInstallConfig(JSON.parse(await readFile(files.config, "utf8")));
  } catch {
    return null;
  }
}

/** Write to a temp file then rename, so a crash never leaves half a file. */
export async function writeFileAtomic(path: string, data: string, mode = 0o600): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data, { mode });
  await rename(tmp, path);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    // execFile: no shell, arguments are never interpreted.
    execFile(cmd, args, { windowsHide: true }, (err) => (err ? fail(err) : ok()));
  });
}

export interface InstallDeps {
  platform: PlatformEnv;
  nodePath: string;
  /** This bundle; copied to a stable location so npx cache cleanup can't break Chrome. */
  selfPath: string;
  runCommand?: (cmd: string, args: string[]) => Promise<void>;
}

export interface InstallResult {
  files: BridgeFiles;
  origin: string;
}

export async function install(extensionIdRaw: string | undefined, deps: InstallDeps): Promise<InstallResult> {
  const id = parseExtensionId(extensionIdRaw);
  if (!id) {
    throw new Error(
      "Pass --extension-id with OrionHUD's 32-letter ID (Settings → Agent bridge shows the exact command, or see chrome://extensions)."
    );
  }
  const files = bridgeFiles(deps.platform);
  const runCommand = deps.runCommand ?? run;

  await mkdir(files.dir, { recursive: true, mode: 0o700 });
  if (resolve(deps.selfPath) !== resolve(files.bundle)) await copyFile(deps.selfPath, files.bundle);
  await writeFileAtomic(files.config, JSON.stringify({ extensionId: id }, null, 2));
  await writeFileAtomic(files.launcher, buildLauncher(deps.platform.platform, deps.nodePath, files.bundle), 0o700);
  if (deps.platform.platform !== "win32") await chmod(files.launcher, 0o700);

  await mkdir(dirname(files.manifest), { recursive: true });
  await writeFileAtomic(files.manifest, JSON.stringify(buildHostManifest(files.launcher, id), null, 2), 0o644);
  if (deps.platform.platform === "win32") {
    await runCommand("reg", ["add", WINDOWS_REGISTRY_KEY, "/ve", "/t", "REG_SZ", "/d", files.manifest, "/f"]);
  }
  return { files, origin: extensionOrigin(id) };
}

export async function uninstall(deps: Pick<InstallDeps, "platform" | "runCommand">): Promise<BridgeFiles> {
  const files = bridgeFiles(deps.platform);
  const runCommand = deps.runCommand ?? run;
  if (deps.platform.platform === "win32") {
    await runCommand("reg", ["delete", WINDOWS_REGISTRY_KEY, "/f"]).catch(() => undefined);
  }
  await rm(files.manifest, { force: true });
  await rm(files.dir, { recursive: true, force: true });
  return files;
}

/** How agents should launch the MCP server: the stable copy, never the npx cache. */
export function mcpCommand(files: BridgeFiles, nodePath: string): { command: string; args: string[] } {
  return { command: nodePath, args: [files.bundle, "mcp"] };
}

export function nextSteps(files: BridgeFiles, nodePath: string): string {
  const { command, args } = mcpCommand(files, nodePath);
  const q = (s: string) => (/[\s"]/.test(s) ? `"${s}"` : s);
  const cursor = JSON.stringify({ mcpServers: { orionhud: { command, args } } }, null, 2);
  return [
    "Next:",
    "  1. In OrionHUD → Settings → Agent bridge, click “Check again”. It should say Connected.",
    "  2. Connect your agent.",
    "",
    "     Claude Code:",
    `       claude mcp add --scope user orionhud -- ${[command, ...args].map(q).join(" ")}`,
    "",
    "     Cursor (~/.cursor/mcp.json):",
    ...cursor.split("\n").map((l) => `       ${l}`),
  ].join("\n");
}

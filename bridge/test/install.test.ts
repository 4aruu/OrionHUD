import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHostManifest, buildLauncher, install, parseExtensionId, uninstall } from "../src/install";
import { WINDOWS_REGISTRY_KEY, bridgeFiles, socketPath, type PlatformEnv } from "../src/paths";

const ID = "abcdefghijklmnopabcdefghijklmnop";

describe("extension id and manifest", () => {
  it("only accepts Chrome's 32-letter a–p ids", () => {
    expect(parseExtensionId(ID)).toBe(ID);
    for (const bad of [undefined, "", "abc", `${ID}a`, ID.toUpperCase(), "qrstuvwxyzqrstuvwxyzqrstuvwxyzqr", `${ID.slice(0, 31)}/`]) {
      expect(parseExtensionId(bad)).toBeNull();
    }
  });

  it("restricts allowed_origins to exactly that extension", () => {
    expect(buildHostManifest("/x/launch.sh", ID)).toEqual({
      name: "com.orionhud.bridge",
      description: "OrionHUD agent bridge",
      path: "/x/launch.sh",
      type: "stdio",
      allowed_origins: [`chrome-extension://${ID}/`],
    });
  });
});

describe("launcher", () => {
  it("quotes posix paths so spaces and quotes can't break out", () => {
    const sh = buildLauncher("linux", "/opt/node bin/node", "/home/o'brien/b.mjs");
    expect(sh).toBe(`#!/bin/sh\nexec '/opt/node bin/node' '/home/o'\\''brien/b.mjs' native-host "$@"\n`);
  });

  it("writes a Windows batch file and refuses cmd metacharacters", () => {
    expect(buildLauncher("win32", "C:\\Program Files\\nodejs\\node.exe", "C:\\Users\\a\\b.mjs")).toBe(
      `@echo off\r\n"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\a\\b.mjs" native-host %*\r\n`
    );
    expect(() => buildLauncher("win32", "C:\\node.exe", "C:\\Users\\100%\\b.mjs")).toThrow(/special characters/);
    expect(() => buildLauncher("win32", "C:\\node.exe", 'C:\\a"&calc\\b.mjs')).toThrow(/special characters/);
  });
});

describe("paths", () => {
  it("uses per-user locations on every platform", () => {
    const win = bridgeFiles({ platform: "win32", home: "C:\\Users\\a", env: { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" } });
    expect(win.dir).toMatch(/AppData[\\/]Local[\\/]OrionHUD[\\/]bridge$/);
    expect(win.socket).toMatch(/^\\\\\.\\pipe\\orionhud-bridge-[0-9a-f]{16}$/);
    const mac = bridgeFiles({ platform: "darwin", home: "/Users/a", env: {} });
    expect(mac.manifest).toContain("/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.orionhud.bridge.json".replace(/\//g, mac.manifest.includes("\\") ? "\\" : "/"));
    const linux = bridgeFiles({ platform: "linux", home: "/home/a", env: {} });
    expect(linux.manifest.replace(/\\/g, "/")).toBe("/home/a/.config/google-chrome/NativeMessagingHosts/com.orionhud.bridge.json");
    expect(linux.socket.replace(/\\/g, "/")).toBe("/home/a/.local/share/orionhud/bridge/bridge.sock");
  });

  it("gives different Windows users different pipe names", () => {
    expect(socketPath("C:\\Users\\a\\AppData\\Local\\OrionHUD\\bridge", "win32")).not.toBe(
      socketPath("C:\\Users\\b\\AppData\\Local\\OrionHUD\\bridge", "win32")
    );
  });
});

describe("install / uninstall", () => {
  let home: string;
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  function setup(platform: NodeJS.Platform): { env: PlatformEnv; self: string } {
    home = mkdtempSync(join(tmpdir(), "orion-install-"));
    const self = join(home, "bundle-source.mjs");
    writeFileSync(self, "// bundle");
    const env: PlatformEnv = { platform, home, env: { LOCALAPPDATA: join(home, "Local") } };
    return { env, self };
  }

  it("writes the bundle copy, config, launcher and manifest (linux layout)", async () => {
    const { env, self } = setup("linux");
    const { files } = await install(ID, { platform: env, nodePath: "/usr/bin/node", selfPath: self });
    expect(readFileSync(files.bundle, "utf8")).toBe("// bundle");
    expect(JSON.parse(readFileSync(files.config, "utf8"))).toEqual({ extensionId: ID });
    expect(JSON.parse(readFileSync(files.manifest, "utf8"))).toEqual(buildHostManifest(files.launcher, ID));
    expect(readFileSync(files.launcher, "utf8")).toContain("native-host");
    if (process.platform !== "win32") {
      expect(statSync(files.config).mode & 0o077).toBe(0);
      expect(statSync(files.launcher).mode & 0o100).toBe(0o100);
    }
    await uninstall({ platform: env });
    expect(existsSync(files.manifest)).toBe(false);
    expect(existsSync(files.dir)).toBe(false);
  });

  it("registers the manifest under HKCU on Windows, via execFile arguments", async () => {
    const { env, self } = setup("win32");
    const runCommand = vi.fn(async () => undefined);
    const { files } = await install(ID, { platform: env, nodePath: "C:\\node\\node.exe", selfPath: self, runCommand });
    expect(runCommand).toHaveBeenCalledWith("reg", ["add", WINDOWS_REGISTRY_KEY, "/ve", "/t", "REG_SZ", "/d", files.manifest, "/f"]);
    await uninstall({ platform: env, runCommand });
    expect(runCommand).toHaveBeenLastCalledWith("reg", ["delete", WINDOWS_REGISTRY_KEY, "/f"]);
  });

  it("refuses a bad extension id before touching the disk", async () => {
    const { env, self } = setup("linux");
    await expect(install("not-an-id", { platform: env, nodePath: "/n", selfPath: self })).rejects.toThrow(/extension-id/);
    expect(existsSync(bridgeFiles(env).dir)).toBe(false);
  });
});

// orionhud-bridge: one file, several roles. See bridge/README.md.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHostClient, readSession } from "./client";
import { runNativeHost } from "./host";
import { install, nextSteps, readInstallConfig, uninstall } from "./install";
import { runMcpServer } from "./mcp";
import { bridgeFiles, currentPlatform } from "./paths";
import { BRIDGE_VERSION } from "./version";

const HELP = `orionhud-bridge ${BRIDGE_VERSION}: lets coding agents read and update your OrionHUD task tree.

Usage:
  orionhud-bridge install --extension-id <id>   register the Chrome native-messaging host (per user)
  orionhud-bridge uninstall                     remove everything install created
  orionhud-bridge status                        show what's installed and whether Chrome is connected
  orionhud-bridge mcp                           run the MCP server on stdio (your agent starts this)
  orionhud-bridge native-host                   (Chrome starts this; not for manual use)
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

function processAlive(pid: unknown): boolean {
  if (typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function status(): Promise<number> {
  const files = bridgeFiles(currentPlatform());
  const config = await readInstallConfig(files);
  const out = process.stdout;
  if (!config) {
    out.write("Not installed. Run: orionhud-bridge install --extension-id <id>\n");
    return 1;
  }
  out.write(`Installed for extension ${config.extensionId}\n`);
  out.write(`  Host manifest: ${files.manifest}${existsSync(files.manifest) ? "" : " (MISSING)"}\n`);
  out.write(`  Bridge files:  ${files.dir}\n`);
  let pid: unknown;
  try {
    pid = (JSON.parse(await readFile(files.session, "utf8")) as { pid?: unknown }).pid;
  } catch {
    pid = undefined;
  }
  out.write(
    processAlive(pid)
      ? "Chrome is connected (host running).\n"
      : "Chrome isn't connected. Open Chrome, then OrionHUD → Settings → Agent bridge.\n"
  );
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const platform = currentPlatform();

  // Chrome invokes the launcher with the caller origin; the launcher adds "native-host".
  if (cmd === "native-host") return runNativeHost(rest);

  switch (cmd) {
    case "mcp": {
      const files = bridgeFiles(platform);
      const call = createHostClient(() => readSession(files.session));
      const log = (line: string) => process.stderr.write(`orionhud-bridge: ${line}\n`);
      await runMcpServer({ input: process.stdin, output: process.stdout, call, log });
      return 0;
    }
    case "install": {
      const result = await install(flag(rest, "--extension-id"), {
        platform,
        nodePath: process.execPath,
        selfPath: fileURLToPath(import.meta.url),
      });
      process.stdout.write(
        `OrionHUD bridge installed.\n  Allowed extension: ${result.origin}\n  Host manifest:     ${result.files.manifest}\n  Bridge files:      ${result.files.dir}\n\n${nextSteps(result.files, process.execPath)}\n`
      );
      return 0;
    }
    case "uninstall": {
      const files = await uninstall({ platform });
      process.stdout.write(`Removed ${files.manifest} and ${files.dir}.\nAlso remove the MCP server from your agent (claude mcp remove orionhud).\n`);
      return 0;
    }
    case "status":
      return status();
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    case "--version":
      process.stdout.write(`${BRIDGE_VERSION}\n`);
      return 0;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`orionhud-bridge: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
);

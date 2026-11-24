/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// Same path as NOTIFICATION_ICON in src/shared/brand.ts (test/icons.test.ts keeps them in step).
const NOTIFICATION_ICON = "icons/notify96.png";

/**
 * crxjs copies only manifest-referenced files, so the notification icon (used by
 * chrome.runtime.getURL in the service worker, not by the manifest) is emitted here at its
 * fixed path. A missing PNG fails the build instead of shipping a broken notification icon.
 */
function notificationIcon(): Plugin {
  return {
    name: "orion-notification-icon",
    apply: "build",
    generateBundle() {
      const source = readFileSync(fileURLToPath(new URL(NOTIFICATION_ICON, import.meta.url)));
      this.emitFile({ type: "asset", fileName: NOTIFICATION_ICON, source });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    notificationIcon(),
  ],
  // Prevent Vite from clearing the console on rebuild so build errors
  // are readable alongside the extension's own console output.
  clearScreen: false,
  // Vitest blanks CSS by default; keep `?raw` CSS so source scans (test/brand.test.ts) see stylesheets.
  test: { css: { include: [/\.css\?raw$/] } },
});

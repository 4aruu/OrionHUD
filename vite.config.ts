/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// Files the manifest doesn't reference (public/icons/notify96.png, the notification icon) live in
// Vite's default publicDir, public/, and are copied to the dist/ root in build and crxjs dev mode.
export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  // Prevent Vite from clearing the console on rebuild so build errors
  // are readable alongside the extension's own console output.
  clearScreen: false,
  // The welcome tab isn't referenced by the manifest, so it's an explicit input (opened on install).
  build: { rollupOptions: { input: { welcome: "src/welcome/index.html" } } },
  // Vitest blanks CSS by default; keep `?raw` CSS so source scans (test/brand.test.ts) see stylesheets.
  test: { css: { include: [/\.css\?raw$/] } },
});

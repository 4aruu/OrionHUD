/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  // Prevent Vite from clearing the console on rebuild so build errors
  // are readable alongside the extension's own console output.
  clearScreen: false,
  // Vitest blanks CSS by default; keep `?raw` CSS so source scans (test/brand.test.ts) see stylesheets.
  test: { css: { include: [/\.css\?raw$/] } },
});

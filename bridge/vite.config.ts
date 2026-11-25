// Builds the bridge into one dependency-free Node ESM file:
// bridge/dist/orion-bridge.mjs. Run from the repo root (npm run build).

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    ssr: here("./src/cli.ts"),
    outDir: here("./dist"),
    emptyOutDir: true,
    target: "node18",
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "orion-bridge.mjs",
        banner: "#!/usr/bin/env node",
      },
    },
  },
  ssr: { target: "node" },
  clearScreen: false,
});

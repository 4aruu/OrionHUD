import { defineConfig } from "vite";

// Builds the in-page capture box as one self-contained IIFE (dist/capture.js),
// injected on demand with chrome.scripting.executeScript({ files }).
// Kept out of web_accessible_resources on purpose: pages can't fetch or
// fingerprint it. Runs after the main build, so it must not empty dist/.
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist",
    copyPublicDir: false,
    lib: {
      entry: "src/content/capture.ts",
      name: "OrionCapture",
      formats: ["iife"],
      fileName: () => "capture.js",
    },
    minify: true,
  },
  clearScreen: false,
});

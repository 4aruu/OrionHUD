import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run harness`: the real side panel in a normal tab with a chrome.* shim
// (dev/chromeShim.ts). Open /?reset&seed for demo data. Dev-only.
export default defineConfig({
  root: "dev",
  // The repo's public/ (theme-boot.js, icons), served at / like the extension build's dist root.
  publicDir: "../public",
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  clearScreen: false,
});

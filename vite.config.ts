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
});

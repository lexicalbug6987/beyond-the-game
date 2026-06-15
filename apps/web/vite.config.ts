import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.API_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    // Expose on the LAN so teammates can scan the QR code from their phones.
    // Default is localhost-only via scripts/dev.sh (VITE_HOST=false).
    host: process.env.VITE_HOST !== "false",
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.API_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Expose on the LAN so teammates can scan the QR code from their phones.
    // Set VITE_HOST=false to bind localhost only.
    host: process.env.VITE_HOST !== "false",
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});

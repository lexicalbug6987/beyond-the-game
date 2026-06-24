import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.API_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: Number(process.env.VITE_PORT ?? 5173),
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});

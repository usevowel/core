import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-vite-plugin";
import path from "path";

export default defineConfig({
  plugins: [
    tanstackRouter({
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react({
      include: "**/*.{jsx,tsx}",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    hmr: {
      overlay: true,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
    proxy: {
      "/api": "http://localhost:3001",
      "/vowel": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
  build: {
    target: "es2020",
    // Charts and drag-and-drop are each used by exactly one route, so keeping
    // them in their own long-lived chunks means an app update doesn't force
    // users to re-download them, and routes that don't use them never do.
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          dnd: ["@dnd-kit/core"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});

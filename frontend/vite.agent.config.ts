import { defineConfig } from "vite";

// Builds the in-page agent as a single classic script served by the pages server (:4001).
export default defineConfig({
  build: {
    lib: {
      entry: "src/agent/index.ts",
      formats: ["iife"],
      name: "FigrAgent",
      fileName: () => "figr-agent.js",
    },
    outDir: "../backend/pages",
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
  },
});

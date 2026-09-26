import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep deploy artifacts comfortably below the hosting transport limit.
        // A truncated JavaScript asset can still look like a successful deploy,
        // but will fail to parse in the browser.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (id.includes("radarContract.generated.json")) return "radar-contract";
          return undefined;
        },
      },
    },
  },
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
});

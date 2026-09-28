import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), {
    name: "radar-require-runtime-config",
    configResolved(config) {
      if (config.command === "build" && (!config.env.VITE_SUPABASE_URL?.trim() || !config.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim())) {
        throw new Error("Falta la configuración de Supabase: no se puede publicar un RADAR sin conexión municipal.");
      }
    },
  }],
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

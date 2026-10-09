import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageMetadata from "./package.json" with { type: "json" };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(packageMetadata.version) },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: mode === "stress" ? ["test/**/*.stress.test.ts"] : ["test/**/*.test.{ts,tsx}"],
    exclude: mode === "stress" ? [] : ["test/**/*.stress.test.ts"],
  },
}));

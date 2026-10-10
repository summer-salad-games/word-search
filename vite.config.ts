import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: mode === "stress" ? ["test/**/*.stress.test.ts"] : ["test/**/*.test.{ts,tsx}"],
    exclude: mode === "stress" ? [] : ["test/**/*.stress.test.ts"],
  },
}));

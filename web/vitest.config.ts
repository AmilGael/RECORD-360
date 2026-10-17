import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  // tsconfig keeps jsx "preserve" for Next; tests that render components need it
  // compiled. Vite 8 transforms with oxc and ignores the old `esbuild` option.
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});

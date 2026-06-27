import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the shared package to its TypeScript source so tests don't
      // require a separate build step between runs.
      "@daemonheim/shared": fileURLToPath(
        new URL("./packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "services/**/*.test.ts", "apps/**/*.test.ts"],
  },
});

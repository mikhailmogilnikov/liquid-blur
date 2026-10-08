import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: "esm",
    platform: "browser",
    target: "es2022",
    dts: true,
    sourcemap: true,
  },
  test: {
    environment: "happy-dom",
    // The packages it meets, from their source: tests don't wait on a build
    alias: {
      "@liquid-web/core": source("../core/src/index.ts"),
      "@liquid-web/blur/melt": source("../blur/src/melt.ts"),
    },
  },
});

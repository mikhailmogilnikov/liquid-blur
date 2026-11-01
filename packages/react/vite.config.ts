import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  pack: {
    // `styles` types the stylesheet, which the build copies from core
    entry: ["src/index.ts", "src/styles.ts"],
    format: "esm",
    platform: "browser",
    target: "es2022",
    dts: true,
    sourcemap: true,
    // Components and hooks for the client, all in one module: React Server Components see it as one
    banner: { js: '"use client";' },
  },
  test: {
    environment: "happy-dom",
    // Core from its source: tests don't wait on a build
    alias: [
      { find: /^@fluidkit\/core$/, replacement: source("../core/src/index.ts") },
      { find: /^@fluidkit\/core\/internal$/, replacement: source("../core/src/internal.ts") },
    ],
  },
});

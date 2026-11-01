import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite-plus";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Svelte components, for the tests. Typed against Vite itself, not Vite+'s copy of it
  plugins: [svelte() as never],
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    environment: "happy-dom",
    // Core from its source: tests don't wait on a build
    alias: [
      { find: /^@fluidkit\/core$/, replacement: source("../core/src/index.ts") },
      { find: /^@fluidkit\/core\/internal$/, replacement: source("../core/src/internal.ts") },
    ],
  },
});

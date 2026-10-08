import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  pack: {
    entry: ["src/press.ts", "src/melt.ts", "src/auto.ts", "src/styles.ts", "src/liquid-blur.css"],
    format: "esm",
    platform: "browser",
    target: "es2022",
    dts: true,
    sourcemap: true,
    /*
     * The stylesheet, minified for the oldest browsers it supports: where `pow()` (Chrome 120,
     * Firefox 118) and `color-mix()` (Safari 16.2) came in. Nothing there needs lowering, and Safari
     * before 18 keeps its `-webkit-backdrop-filter`, which a target-less build would drop.
     */
    css: { fileName: "style.css", minify: true, target: ["chrome120", "firefox118", "safari16.2"] },
  },
  test: {
    environment: "happy-dom",
    // Core from its source: tests don't wait on a build
    alias: { "@liquid-web/core": source("../core/src/index.ts") },
  },
});

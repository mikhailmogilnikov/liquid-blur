import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // `internal` for the framework packages; `auto` installs press on import; `styles` types the stylesheet
    entry: ["src/index.ts", "src/internal.ts", "src/auto.ts", "src/styles.ts", "src/style.css"],
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
    // The springs run on requestAnimationFrame
    environment: "happy-dom",
  },
});

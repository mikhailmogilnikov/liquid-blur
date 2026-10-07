import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/auto.ts", "src/group.ts", "src/morph.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: true,
  target: "es2022",
});

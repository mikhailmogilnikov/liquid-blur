import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * Who may import whom. Each feature is a folder that imports the shared base and its own files, never
 * another feature: features meet through the DOM attributes in the base. The base imports no feature,
 * and nothing imports a package, a framework least of all: the framework packages are built on this.
 */
const FEATURES = ["blur", "drag", "indicator", "layout", "lift", "morph"];
const BASE = ["base", "box", "click", "contract", "motion", "select", "settings", "springAnimator"];
// Blur's press and melt never import each other, so either can be had alone
const BLUR: Record<string, string[]> = {
  blob: [],
  interaction: ["../base"],
  group: ["./blob", "../base"],
  variants: [],
  index: ["./group", "./interaction"],
};

const src = join(__dirname, "..", "src");
const importsOf = (file: string) =>
  [...readFileSync(join(src, file), "utf8").matchAll(/^(?:import|export)[^;]*?from\s+"([^"]+?)(?:\.js)?"/gms)]
    .map((m) => m[1])
    .sort();

describe("module boundaries", () => {
  it("knows every folder and file", () => {
    const entries = readdirSync(src, { withFileTypes: true });
    expect(entries.filter((e) => e.isDirectory()).map((e) => e.name)).toEqual(FEATURES);
    const files = entries.filter((e) => e.isFile() && e.name.endsWith(".ts")).map((e) => e.name.replace(/\.ts$/, ""));
    expect(files.sort()).toEqual([...BASE, "auto", "index", "internal", "styles"].sort());
  });

  for (const name of BASE) {
    it(`${name} imports only the base`, () => {
      for (const from of importsOf(`${name}.ts`)) expect(BASE.map((b) => `./${b}`)).toContain(from);
    });
  }

  for (const feature of FEATURES.filter((f) => f !== "blur")) {
    it(`${feature} imports the base alone`, () => {
      expect(readdirSync(join(src, feature))).toEqual(["index.ts"]);
      expect(importsOf(`${feature}/index.ts`)).toEqual(["../base"]);
    });
  }

  it("blur imports the base and itself, press and melt apart", () => {
    const files = readdirSync(join(src, "blur")).filter((f) => f.endsWith(".ts"));
    expect(files.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(Object.keys(BLUR).sort());
    for (const [name, allowed] of Object.entries(BLUR)) expect(importsOf(`blur/${name}.ts`)).toEqual(allowed.sort());
  });

  it("depends on nothing", () => {
    const { dependencies, peerDependencies } = JSON.parse(readFileSync(join(src, "..", "package.json"), "utf8"));
    expect(dependencies).toBeUndefined();
    expect(peerDependencies).toBeUndefined();
  });
});

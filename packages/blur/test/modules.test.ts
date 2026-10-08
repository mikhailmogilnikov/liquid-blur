import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * Who may import whom. Press and melt never import each other, and the package imports nothing of
 * the family but @liquid-web/core: where it meets morph it does so through the DOM names there.
 */
const allowed: Record<string, string[]> = {
  blob: [],
  interaction: ["@liquid-web/core"],
  group: ["./blob", "@liquid-web/core"],
  // Entries
  press: ["./interaction"],
  melt: ["./group"],
  auto: ["./interaction"],
  styles: [],
};

const root = join(__dirname, "..");
const importsOf = (file: string) =>
  [...readFileSync(join(root, "src", file), "utf8").matchAll(/^(?:import|export)[^;]*?from\s+"([^"]+?)(?:\.js)?"/gms)]
    .map((m) => m[1])
    .sort();

describe("module boundaries", () => {
  const files = readdirSync(join(root, "src")).filter((f) => f.endsWith(".ts"));

  it("knows every source file", () => {
    expect(files.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(Object.keys(allowed).sort());
  });

  for (const file of files) {
    const name = file.replace(/\.ts$/, "");
    it(`${name} imports only what it may`, () => {
      expect(importsOf(file)).toEqual([...new Set(allowed[name])].sort());
    });
  }

  it("depends on core alone", () => {
    const { dependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(Object.keys(dependencies)).toEqual(["@liquid-web/core"]);
  });
});

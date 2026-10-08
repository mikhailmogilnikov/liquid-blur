import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Who may import whom. The modules (press, melt, morph) never import each other: they meet only
 * through the DOM names in contract.ts, so each works alone. Entries only re-export.
 */
const allowed: Record<string, string[]> = {
  // Shared ground
  contract: [],
  springAnimator: [],
  blob: [],
  // Modules
  interaction: ["contract", "springAnimator"],
  group: ["blob", "contract"],
  morph: ["contract", "springAnimator"],
  // Entries
  index: ["interaction", "springAnimator"],
  auto: ["interaction"],
  spring: ["springAnimator"],
  press: ["interaction"],
  melt: ["group"],
  styles: [],
};

const src = join(__dirname, "../src");
const importsOf = (file: string) =>
  [...readFileSync(join(src, file), "utf8").matchAll(/^(?:import|export)[^;]*?from\s+"\.\/([^"]+?)(?:\.js)?"/gms)]
    .map((m) => m[1])
    .sort();

describe("module boundaries", () => {
  const files = readdirSync(src).filter((f) => f.endsWith(".ts"));

  it("knows every source file", () => {
    expect(files.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(Object.keys(allowed).sort());
  });

  for (const file of files) {
    const name = file.replace(/\.ts$/, "");
    it(`${name} imports only what it may`, () => {
      expect(importsOf(file)).toEqual([...new Set(allowed[name])].sort());
    });
  }
});

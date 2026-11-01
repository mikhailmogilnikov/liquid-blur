import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { springCss, springs, transitions, type TransitionParams } from "../../src/motion";
import { SpringAnimator, type SpringParams } from "../../src/springAnimator";

const CSS = join(__dirname, "..", "..", "src", "motion.css");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** A `linear()` easing as its points: progress of the time, value */
function stopsOf(easing: string): [number, number][] {
  const inner = /^linear\((.*)\)$/.exec(easing)![1];
  const parts = inner.split(", ");
  return parts.map((part, i) => {
    const [value, at] = part.split(" ");
    const t = at ? parseFloat(at) / 100 : i === 0 ? 0 : 1;
    return [t, parseFloat(value)];
  });
}
/** The easing's value that far into its time */
function valueAt(stops: [number, number][], t: number) {
  const i = stops.findIndex(([at]) => at >= t);
  if (i <= 0) return stops[0][1];
  const [t0, x0] = stops[i - 1];
  const [t1, x1] = stops[i];
  return x0 + ((x1 - x0) * (t - t0)) / (t1 - t0);
}

describe("springs", () => {
  it("gives each preset, tuned when asked", () => {
    expect(springs.smooth()).toEqual({ duration: 0.3, bounce: 0 });
    expect(springs.snappy()).toEqual({ duration: 0.26, bounce: 0.15 });
    expect(springs.bouncy()).toEqual({ duration: 0.36, bounce: 0.3 });
    expect(springs.interactive()).toEqual({ duration: 0.15, bounce: 0.14 });
    expect(springs.snappy({ duration: 0.3, extraBounce: 0.05 })).toEqual({ duration: 0.3, bounce: 0.2 });
  });

  it("keeps the bounce from 0 to 0.99", () => {
    expect(springs.smooth({ extraBounce: -0.2 }).bounce).toBe(0);
    expect(springs.bouncy({ extraBounce: 2 }).bounce).toBe(0.99);
  });
});

describe("transitions", () => {
  it("gives each look, tuned when asked", () => {
    expect(transitions.opacity()).toEqual({ opacity: 0 });
    expect(transitions.scale()).toEqual({ opacity: 0, scale: 0.96 });
    expect(transitions.scale(0.9)).toEqual({ opacity: 0, scale: 0.9 });
    expect(transitions.blurReplace()).toEqual({ opacity: 0, scale: 0.9, blur: 8 });
    expect(transitions.blurReplace({ blur: 12 })).toEqual({ opacity: 0, scale: 0.9, blur: 12 });
    expect(transitions.move()).toEqual({ opacity: 0, x: 0, y: 12 });
    expect(transitions.move({ x: -20, y: 0 })).toEqual({ opacity: 0, x: -20, y: 0 });
  });
});

describe("springCss", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  /** A spring run from 0 to 1 as the packages run it, frame by frame: when, and where */
  const run = (params: SpringParams) => {
    const frames: [number, number][] = [];
    let start = -1;
    let rested = 0;
    const spring = new SpringAnimator(
      { x: 0 },
      params,
      ({ x }) => {
        if (start >= 0) frames.push([(performance.now() - start) / 1000, x]);
      },
      () => (rested = (performance.now() - start) / 1000),
      0.001,
    );
    start = performance.now();
    spring.to({ x: 1 });
    vi.advanceTimersByTime(3000);
    return { frames, rested };
  };

  it("starts at 0 and ends at 1", () => {
    for (const make of Object.values(springs)) {
      const stops = stopsOf(springCss(make()).easing);
      expect(stops[0]).toEqual([0, 0]);
      expect(stops.at(-1)).toEqual([1, 1]);
    }
  });

  it("follows the spring's own curve, past its target and back, and lasts until it rests", () => {
    for (const params of [
      ...Object.values(springs).map((make) => make()),
      { duration: 0.5, bounce: 0.6, settle: 0.1 },
    ]) {
      const { duration, easing } = springCss(params);
      const seconds = parseFloat(duration);
      const stops = stopsOf(easing);
      const { frames, rested } = run(params);
      expect(Math.abs(seconds - rested)).toBeLessThan(0.034);
      for (const [t, x] of frames)
        if (t < seconds) expect(Math.abs(valueAt(stops, t / seconds) - x)).toBeLessThan(0.003);
    }
    // A bouncy one goes past 1
    expect(Math.max(...stopsOf(springCss(springs.bouncy()).easing).map(([, x]) => x))).toBeGreaterThan(1.02);
  });
});

describe("motion.css", () => {
  it("has the springs as `springs` has them", () => {
    const lines = Object.entries(springs).flatMap(([name, make]) => {
      const { duration, easing } = springCss(make());
      return [
        `  --fk-${name}-duration: ${duration};`,
        `  --fk-${name}-easing: ${easing};`,
        `  --fk-${name}: var(--fk-${name}-duration) var(--fk-${name}-easing);`,
      ];
    });
    const block = `:root {\n${lines.join("\n")}\n}`;
    const css = readFileSync(CSS, "utf8");
    const written = /(\/\* springs:[^\n]*\*\/\n)([\s\S]*?)(\n\/\* end of springs \*\/)/;
    // `gen:motion` writes them
    if (process.env.FK_WRITE_MOTION)
      writeFileSync(
        CSS,
        css.replace(written, (_, open, __, close) => open + block + close),
      );
    else expect(flat(written.exec(css)?.[2] ?? "")).toBe(flat(block));
  });

  it("has the ways in and out as `transitions` has them", () => {
    const css = readFileSync(CSS, "utf8");
    const looks: [string, TransitionParams][] = [
      ["opacity", transitions.opacity()],
      ["scale", transitions.scale()],
      ["blur-replace", transitions.blurReplace()],
      ["move", transitions.move()],
    ];
    for (const [name, look] of looks) {
      const rule = new RegExp(`\\.fk-${name} \\{([^}]*)\\}`).exec(css)![1];
      const value = (prop: string) => parseFloat(new RegExp(`--fk-${prop}: ([^;]+);`).exec(rule)![1]);
      expect(value("opacity")).toBe(look.opacity ?? 1);
      expect(value("scale")).toBe(look.scale ?? 1);
      expect(value("blur")).toBe(look.blur ?? 0);
      expect(value("x")).toBe(look.x ?? 0);
      expect(value("y")).toBe(look.y ?? 0);
    }
    // Told nothing, it's `scale()`
    expect(css).toContain(`var(--fk-opacity, ${transitions.scale().opacity})`);
    expect(css).toContain(`var(--fk-scale, ${transitions.scale().scale})`);
  });
});

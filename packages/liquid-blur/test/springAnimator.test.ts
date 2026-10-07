import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpringAnimator } from "../src/springAnimator";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => vi.useRealTimers());

describe("SpringAnimator", () => {
  it("paints the initial value right away", () => {
    const onUpdate = vi.fn();
    new SpringAnimator({ x: 5 }, { duration: 0.3, bounce: 0 }, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith({ x: 5 });
  });

  it("settles exactly on the target and rests once", () => {
    const frames: { x: number }[] = [];
    const onRest = vi.fn();
    const spring = new SpringAnimator({ x: 0 }, { duration: 0.3, bounce: 0 }, (v) => frames.push(v), onRest);
    spring.to({ x: 100 });
    vi.advanceTimersByTime(2000);
    expect(frames.at(-1)).toEqual({ x: 100 });
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it("rests sooner with a coarser precision, still exactly on the target", () => {
    const restsAfter = (precision?: number) => {
      let frames = 0;
      let last = 0;
      let rested = -1;
      const spring = new SpringAnimator(
        { x: 0 },
        { duration: 0.5, bounce: 0.3 },
        (v) => {
          frames++;
          last = v.x;
        },
        () => (rested = frames),
        precision,
      );
      spring.to({ x: 300 });
      vi.advanceTimersByTime(5000);
      expect(last).toBe(300);
      return rested;
    };
    expect(restsAfter(0.25)).toBeLessThan(restsAfter() - 10);
  });

  it("overshoots once when pushed, even without bounce, and swings back no more", () => {
    const frames: number[] = [];
    const spring = new SpringAnimator({ x: 0 }, { duration: 0.4, bounce: 0 }, (v) => frames.push(v.x));
    // A push toward the target, twice the spring's frequency times the distance: ~13.5% past
    spring.to({ x: 100 }, undefined, { x: 2 * ((2 * Math.PI) / 0.4) * 100 });
    vi.advanceTimersByTime(3000);
    const peak = Math.max(...frames);
    expect(peak).toBeGreaterThan(110);
    expect(peak).toBeLessThan(116);
    const after = frames.slice(frames.indexOf(peak));
    expect(after.every((x, i) => i === 0 || x <= after[i - 1])).toBe(true);
    expect(frames.at(-1)).toBe(100);
  });

  it("overshoots once with a bouncy spring that settles at no bounce", () => {
    const run = (settle?: number) => {
      const frames: number[] = [];
      new SpringAnimator({ x: 0 }, { duration: 0.3, bounce: 0.6, settle }, (v) => frames.push(v.x)).to({ x: 100 });
      vi.advanceTimersByTime(3000);
      return frames;
    };
    // Bouncy throughout: past, back under, past again
    const swinging = run();
    const peak = Math.max(...swinging);
    expect(Math.min(...swinging.slice(swinging.indexOf(peak)))).toBeLessThan(99);
    // Settling: the same way out, then straight home
    const settling = run(0);
    expect(Math.max(...settling)).toBeCloseTo(peak, 0);
    const after = settling.slice(settling.indexOf(Math.max(...settling)));
    expect(after.every((x, i) => i === 0 || x <= after[i - 1])).toBe(true);
    expect(settling.at(-1)).toBe(100);
  });

  it("doesn't overshoot without bounce, does with it", () => {
    const max = (bounce: number) => {
      const frames: { x: number }[] = [];
      new SpringAnimator({ x: 0 }, { duration: 0.3, bounce }, (v) => frames.push(v)).to({ x: 100 });
      vi.advanceTimersByTime(2000);
      return Math.max(...frames.map((f) => f.x));
    };
    expect(max(0)).toBeLessThanOrEqual(100);
    expect(max(0.5)).toBeGreaterThan(105);
  });

  it("keeps its velocity when retargeted mid-flight", () => {
    const frames: { x: number }[] = [];
    const spring = new SpringAnimator({ x: 0 }, { duration: 0.5, bounce: 0 }, (v) => frames.push(v));
    spring.to({ x: 100 });
    vi.advanceTimersByTime(100);
    const before = spring.values().x;
    spring.to({ x: 0 });
    vi.advanceTimersByTime(17);
    // Still moving forward for a moment instead of jumping back
    expect(spring.values().x).toBeGreaterThan(before);
  });

  it("runs each channel on its own spring", () => {
    const settled: Record<string, number> = {};
    const spring = new SpringAnimator(
      { fast: 0, slow: 0 },
      { fast: { duration: 0.1, bounce: 0 }, slow: { duration: 0.8, bounce: 0 } },
      (v) => {
        const now = performance.now();
        for (const key of ["fast", "slow"] as const) {
          if (settled[key] === undefined && Math.abs(v[key] - 1) < 0.01) settled[key] = now;
        }
      },
    );
    spring.to({ fast: 1, slow: 1 });
    vi.advanceTimersByTime(3000);
    expect(settled.fast).toBeLessThan(settled.slow);
  });

  it("stops without resting", () => {
    const onRest = vi.fn();
    const spring = new SpringAnimator({ x: 0 }, { duration: 0.3, bounce: 0 }, () => {}, onRest);
    spring.to({ x: 1 });
    vi.advanceTimersByTime(50);
    spring.stop();
    vi.advanceTimersByTime(2000);
    expect(onRest).not.toHaveBeenCalled();
  });
});

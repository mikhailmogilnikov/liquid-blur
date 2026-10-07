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

/** SwiftUI-style spring: perceptual duration in seconds, bounce 0 (no overshoot) to 1. */
export type SpringParams = { duration: number; bounce: number };

/** One spring for every channel, or one per channel. */
export type SpringConfig<K extends string> = SpringParams | Record<K, SpringParams>;

/**
 * Interruptible spring for several numeric channels at once (e.g. width, height, radius).
 * Retargeting keeps the current velocity, so reversing mid-flight stays smooth —
 * which CSS transitions can't do. Values are pushed to `onUpdate` every frame;
 * write them straight to `element.style`. Channels can share one spring or each have their own.
 * A channel rests once what's left of its motion, distance and speed together, is within its
 * precision (0.01 unless given): for pixels a quarter of a pixel is plenty and rests far sooner.
 */
export class SpringAnimator<K extends string> {
  private state: Record<K, { x: number; v: number }>;
  private target: Record<K, number>;
  private frame = 0;
  private last = 0;

  constructor(
    initial: Record<K, number>,
    private params: SpringConfig<K>,
    private onUpdate: (values: Record<K, number>) => void,
    private onRest?: () => void,
    private precision: number | Partial<Record<K, number>> = 0.01,
  ) {
    this.state = Object.fromEntries(
      Object.entries(initial).map(([key, x]) => [key, { x: x as number, v: 0 }]),
    ) as Record<K, { x: number; v: number }>;
    this.target = { ...initial };
    onUpdate(this.values());
  }

  values(): Record<K, number> {
    return Object.fromEntries(Object.entries(this.state).map(([k, s]) => [k, (s as { x: number }).x])) as Record<
      K,
      number
    >;
  }

  to(target: Record<K, number>, params?: SpringConfig<K>) {
    this.target = { ...target };
    if (params) this.params = params;
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** A channel named `duration` holds an object, so a number there means one shared spring */
  private paramsOf(key: K): SpringParams {
    const params = this.params;
    return typeof (params as SpringParams).duration === "number"
      ? (params as SpringParams)
      : (params as Record<K, SpringParams>)[key];
  }

  private tick = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;

    // Fixed substeps keep stiff springs stable regardless of frame rate
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    let resting = true;

    for (const key of Object.keys(this.state) as K[]) {
      const { duration, bounce } = this.paramsOf(key);
      const omega = (2 * Math.PI) / duration;
      const stiffness = omega * omega;
      const damping = 2 * Math.max(0, 1 - bounce) * omega;
      const s = this.state[key];
      const goal = this.target[key];
      for (let i = 0; i < steps; i++) {
        const a = -stiffness * (s.x - goal) - damping * s.v;
        s.v += a * h;
        s.x += s.v * h;
      }
      // How far it would still swing: the distance left and the speed as a distance
      const precision = typeof this.precision === "number" ? this.precision : (this.precision[key] ?? 0.01);
      if (Math.hypot(s.x - goal, s.v / omega) > precision) resting = false;
    }

    if (resting) {
      for (const key of Object.keys(this.state) as K[]) {
        this.state[key].x = this.target[key];
        this.state[key].v = 0;
      }
      this.onUpdate(this.values());
      this.frame = 0;
      this.onRest?.();
      return;
    }

    this.onUpdate(this.values());
    this.frame = requestAnimationFrame(this.tick);
  };
}

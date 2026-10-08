/**
 * SwiftUI-style spring: perceptual duration in seconds, bounce 0 (no overshoot) to 1. `settle`
 * is the bounce once it has turned for the first time (past its target and back, or reversed):
 * a bouncy spring that settles at a low one overshoots once and comes back without swinging again.
 * Unless given, it's the bounce throughout.
 */
export type SpringParams = { duration: number; bounce: number; settle?: number };

/**
 * Moves a spring `dt` seconds on, solved exactly rather than stepped: right at any frame rate,
 * stable at any stiffness, and a push (a starting velocity) carries as far as it should.
 * `zeta` is the damping ratio, 0 (swings forever) to 1 (critically damped, no swing).
 */
function step(s: { x: number; v: number }, goal: number, omega: number, zeta: number, dt: number) {
  const e = s.x - goal;
  const v = s.v;
  const decay = Math.exp(-zeta * omega * dt);
  if (zeta >= 1) {
    const b = v + omega * e;
    s.x = goal + (e + b * dt) * decay;
    s.v = (v - omega * b * dt) * decay;
    return;
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const cos = Math.cos(wd * dt);
  const sin = Math.sin(wd * dt);
  s.x = goal + decay * (e * cos + ((v + zeta * omega * e) / wd) * sin);
  s.v = decay * (v * cos - ((zeta * omega * v + omega * omega * e) / wd) * sin);
}

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
  /** Each channel's position, velocity, and whether it has turned since it last set off */
  private state: Record<K, { x: number; v: number; turned: boolean }>;
  private target: Record<K, number>;
  private frame = 0;
  private last = 0;

  constructor(
    initial: Record<K, number>,
    // The channels come from `initial`, never from the springs' own keys
    private params: SpringConfig<NoInfer<K>>,
    private onUpdate: (values: Record<K, number>) => void,
    private onRest?: () => void,
    private precision: number | Partial<Record<K, number>> = 0.01,
  ) {
    this.state = Object.fromEntries(
      Object.entries(initial).map(([key, x]) => [key, { x: x as number, v: 0, turned: false }]),
    ) as Record<K, { x: number; v: number; turned: boolean }>;
    this.target = { ...initial };
    onUpdate(this.values());
  }

  values(): Record<K, number> {
    return Object.fromEntries(Object.entries(this.state).map(([k, s]) => [k, (s as { x: number }).x])) as Record<
      K,
      number
    >;
  }

  /**
   * Heads for `target`, keeping the current velocity. `velocity` (units per second, per channel)
   * replaces it where given: a push toward the target makes even an overdamped spring overshoot
   * once, then come back without swinging.
   */
  to(target: Record<K, number>, params?: SpringConfig<K>, velocity?: Partial<Record<K, number>>) {
    this.target = { ...target };
    if (params) this.params = params;
    // A new target is a new flight: bouncy again until it turns
    for (const s of Object.values(this.state) as { turned: boolean }[]) s.turned = false;
    if (velocity) {
      for (const key of Object.keys(velocity) as K[]) {
        const v = velocity[key];
        if (v !== undefined && this.state[key]) this.state[key].v = v;
      }
    }
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  /**
   * Moves the target of the flight under way, keeping its springs, its velocity and whether each
   * channel has turned: a correction, not a new flight, so a spring that has already overshot
   * doesn't overshoot again.
   */
  retarget(target: Record<K, number>) {
    this.target = { ...target };
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

    let resting = true;

    for (const key of Object.keys(this.state) as K[]) {
      const { duration, bounce, settle = bounce } = this.paramsOf(key);
      const omega = (2 * Math.PI) / duration;
      const s = this.state[key];
      const goal = this.target[key];
      const before = s.v;
      step(s, goal, omega, Math.min(1, Math.max(0, 1 - (s.turned ? settle : bounce))), dt);
      // Turned: it was moving and now moves the other way
      if (!s.turned && before !== 0 && Math.sign(s.v) !== Math.sign(before)) s.turned = true;
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

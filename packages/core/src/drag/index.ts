import { SpringAnimator, holdSelection, px, swallowClick, type SpringParams } from "../base.js";

/**
 * Drag: one element moved by a pointer, along one axis or both, as iOS moves its sheets, the rows
 * of a list swiped open, the thumb of a switch, a picture-in-picture thrown into a corner.
 *
 * Under the pointer it follows exactly; past its bounds it pulls back like rubber, less the further
 * it goes. Let go, it heads for one of its snap points on a spring that starts at the pointer's own
 * speed: the point nearest to where it would have come to rest by itself, slowing down as a scroll
 * does. So a flick reaches a far point and a slow drag settles on the near one. With no snap points
 * it comes to rest where it would have, within its bounds. With a `follow` spring it chases the
 * pointer instead of sitting under it, and is let go at its own speed. Caught on its way, it stops
 * under the pointer and is dragged from there; let go without being moved, it goes on where it was
 * going and the tap is the page's click (a switch tapped twice quickly flips back).
 *
 * A drag starts once the pointer has moved a few pixels along its axis: moving across it first,
 * it's the page's (a finger scrolling a list past a row that swipes sideways). On touch the browser
 * gets the other axis: the handle's `touch-action` is set to pan along it, or to none for both.
 * The click that would follow a drag is dropped, so a dragged button isn't pressed. Nothing starts
 * on a text field. In nested handles (rows that swipe in a sheet) the innermost drag that starts has
 * the pointer, alone.
 *
 * Positions are offsets from where the element is laid out, in its own pixels (a scaled container
 * works), written to its inline `translate` and nothing else: its `transform` and `scale` stay free
 * for the page and for press behaviors. While a pointer drags it, it's marked `data-dragging`.
 * Snap points and bounds can be functions: read again when the element, its parent or the window
 * is resized, so a sheet's "half the screen" stays half.
 *
 * With a `scroll` area inside, such as a sheet's list, a finger hands one gesture between the two,
 * as iOS sheets do: pulled toward its later snap points (a bottom sheet down) with the list at its
 * start, or pushed back while it isn't at its first, the element moves, else the list scrolls; a list
 * scrolled back to its start and still pulled hands the gesture to the element, and an element
 * pushed all the way hands the rest of it to the list. That's touch: a mouse drags, a wheel scrolls.
 */

export type DragAxis = "x" | "y" | "both";
export type DragPoint = { x: number; y: number };
/** Offsets along the axis (`x` or `y`), or points (`both`) */
export type DragSnaps = readonly number[] | readonly DragPoint[];
/** The range of offsets on each axis it moves along; past them, it's rubber */
export type DragBounds = { x?: readonly [number, number]; y?: readonly [number, number] };

export type DragOptions = {
  /** What moves: its inline `translate` is the drag's */
  element: HTMLElement;
  /** What's grabbed, such as a sheet's grabber; the element itself unless given */
  handle?: HTMLElement;
  /** Along `x`, `y`, or `both` (the default) */
  axis?: DragAxis;
  /** Where it may come to rest; a function is read again on a resize */
  snaps?: DragSnaps | (() => DragSnaps);
  /**
   * An area inside that scrolls along its axis, such as a sheet's list: a finger's gesture goes
   * from one to the other, as in iOS sheets. Along one axis only
   */
  scroll?: HTMLElement;
  /** How far it moves before it's rubber; the farthest snap points unless given, else unbounded */
  bounds?: DragBounds | (() => DragBounds);
  /** The snap point it starts at; the first unless given */
  initial?: number;
  /**
   * How hard it pulls back past its bounds, dragged or overshooting on its spring: 0.55 as iOS has
   * it; 0 stops it there
   */
  rubberband?: number;
  /**
   * How quickly something let go would slow down by itself, per millisecond: 0.998 as a scroll
   * does, 0.99 sooner. What a flick reaches is judged by it
   */
  deceleration?: number;
  /** The spring it settles on; `defaultDragSpring` unless given */
  spring?: SpringParams;
  /**
   * A spring it follows the pointer on while dragged, as iOS 27's switches do: a pointer flung
   * back and forth is followed through, not jumped after. Exactly under the pointer unless given
   */
  follow?: SpringParams;
  /** Called when a pointer starts dragging it, or catches it on its way */
  onStart?: () => void;
  /** Called with its offset and speed (px/s) whenever it moves: dragged, settling, put somewhere */
  onMove?: (position: DragPoint, velocity: DragPoint) => void;
  /** Called when it's let go, with the snap point it heads for (`null` with none) */
  onEnd?: (snap: number | null) => void;
  /** Called when it has come to rest */
  onRest?: () => void;
};

/**
 * `instant`: there at once, as with reduced motion. `velocity`: the speed it sets off at, px/s (a
 * number along the axis), the one it has unless given
 */
export type DragMove = { instant?: boolean; velocity?: number | DragPoint };

/**
 * What a drag can be told again once made: all but its element, handle, axis, scroll area and
 * initial snap point
 */
export type DragSettings = Omit<DragOptions, "element" | "handle" | "axis" | "scroll" | "initial">;

export type Drag = {
  /** Its offset now */
  readonly position: DragPoint;
  /** Its speed now, px/s */
  readonly velocity: DragPoint;
  /** A pointer is dragging it */
  readonly dragging: boolean;
  /** Dragged, or on its way somewhere */
  readonly moving: boolean;
  /** The snap point it's at or heads for; `null` when it was put elsewhere, or has none */
  readonly current: number | null;
  /** Not dragged while true; a drag under way is let go */
  disabled: boolean;
  /** To snap point `index` */
  snap(index: number, move?: DragMove): void;
  /** To an offset, within its bounds: a number along the axis, or a point */
  to(position: number | DragPoint, move?: DragMove): void;
  /** Reads the snap points and bounds again, and follows them */
  update(): void;
  /**
   * Takes new settings, the rest kept: a component's props as they change, without a drag made
   * again. New snap points or bounds are followed at once, as by `update()`
   */
  set(settings: Partial<DragSettings>): void;
  destroy(): void;
};

/**
 * The spring it settles on unless given another: no bounce, yet a flick's speed carries it past
 * its point once and back, as iOS sheets go
 */
export const defaultDragSpring: SpringParams = { duration: 0.4, bounce: 0 };

const RUBBERBAND = 0.55;
const DECELERATION = 0.998;
/** How far a pointer moves before it drags, px: a finger is less exact than a mouse */
const SLOP = 4;
const TOUCH_SLOP = 8;
/** How far a finger in the scroll area moves before it's the area's or the drag's, px */
const DECIDE = 3;
/** The pointer's speed is how far it went in this long before it let go, ms */
const VELOCITY_WINDOW = 100;
/** How long after a drag the click it would make may still come, ms */
const CLICK_WINDOW = 400;
/** Where a pointer down doesn't drag: text is selected there */
const NO_DRAG = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
/** On the element while a pointer drags it: the page's to style */
const DRAGGING = "data-dragging";
/** Where it's done: a quarter of a pixel */
const PRECISION = 0.25;
/**
 * A pointer catches it on its way only while it visibly moves: farther than this from where it's
 * headed, px, or faster than this, px/s. In the last of a spring's tail it's put there instead, so
 * a finger on a sheet that has as good as stopped scrolls its list, with the list's own momentum
 */
const CATCH_DISTANCE = 2;
const CATCH_SPEED = 40;
const ZERO: Readonly<DragPoint> = Object.freeze({ x: 0, y: 0 });

/** How far a pull of `over` px past an edge shows, for an element `size` px long (iOS's curve) */
const band = (over: number, size: number, c: number) => (1 - 1 / ((over * c) / size + 1)) * size;
/** The pull that shows `shown` px past an edge: `band` undone */
const unband = (shown: number, size: number, c: number) => (size / c) * (shown / (size - Math.min(shown, size * 0.99)));

/** Where something let go at `v` px/s comes to rest by itself, slowing by `rate` each millisecond */
const project = (v: number, rate: number) => ((v / 1000) * rate) / (1 - rate);

type Sample = { t: number; x: number; y: number };
/** A pointer, or a touch, as the drag reads it: where it is on screen and when */
type Input = { id: number; touch: boolean; x: number; y: number; t: number };

/** Pointers a drag has: in nested handles the innermost drag that starts takes one, alone */
const claimed = new Set<number>();

export function createDrag(options: DragOptions): Drag {
  const { element, handle = element, axis = "both" } = options;
  let { onStart, onMove, onEnd, onRest } = options;
  /** The snap points and bounds as given, a function or not: read again on `update()` */
  let given = { snaps: options.snaps, bounds: options.bounds };
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const rubberOf = (v?: number) => Math.max(0, v ?? RUBBERBAND);
  const rateOf = (v?: number) => Math.min(0.9999, Math.max(0, v ?? DECELERATION));
  let rubber = rubberOf(options.rubberband);
  let rate = rateOf(options.deceleration);
  const onX = axis !== "y";
  const onY = axis !== "x";
  const own = { translate: element.style.translate, touchAction: handle.style.touchAction };

  /** Along the axis it moves on, or both */
  const point = (v: number | DragPoint): DragPoint =>
    typeof v === "number"
      ? { x: axis === "y" ? 0 : v, y: axis === "y" ? v : 0 }
      : { x: onX ? v.x : 0, y: onY ? v.y : 0 };

  let snaps: DragPoint[] = [];
  let bounds = { x: [0, 0], y: [0, 0] };
  /** Its size, how far its rubber can stretch */
  let size = { x: 0, y: 0 };
  /** The snap points, bounds and size as they are now */
  const read = () => {
    const points = typeof given.snaps === "function" ? given.snaps() : (given.snaps ?? []);
    snaps = points.map(point);
    const b = typeof given.bounds === "function" ? given.bounds() : given.bounds;
    const range = (k: "x" | "y", on: boolean) => {
      if (!on) return [0, 0];
      const set = b?.[k];
      if (set) return [Math.min(set[0], set[1]), Math.max(set[0], set[1])];
      if (!snaps.length) return [-Infinity, Infinity];
      const at = snaps.map((s) => s[k]);
      return [Math.min(...at), Math.max(...at)];
    };
    bounds = { x: range("x", onX), y: range("y", onY) };
    size = { x: element.offsetWidth, y: element.offsetHeight };
  };

  /** A pull to where it shows, past its bounds stretched as rubber */
  const stretch = (raw: DragPoint): DragPoint => {
    const one = (v: number, [lo, hi]: number[], s: number) => {
      if (v < lo) return rubber && s ? lo - band(lo - v, s, rubber) : lo;
      if (v > hi) return rubber && s ? hi + band(v - hi, s, rubber) : hi;
      return v;
    };
    return { x: one(raw.x, bounds.x, size.x), y: one(raw.y, bounds.y, size.y) };
  };
  /** Where it shows to the pull that put it there: caught past its bounds, it isn't pulled back */
  const unstretch = (shown: DragPoint): DragPoint => {
    const one = (v: number, [lo, hi]: number[], s: number) => {
      if (!rubber || !s) return v;
      if (v < lo) return lo - unband(lo - v, s, rubber);
      if (v > hi) return hi + unband(v - hi, s, rubber);
      return v;
    };
    return { x: one(shown.x, bounds.x, size.x), y: one(shown.y, bounds.y, size.y) };
  };
  const clamp = (p: DragPoint): DragPoint => ({
    x: Math.min(bounds.x[1], Math.max(bounds.x[0], p.x)),
    y: Math.min(bounds.y[1], Math.max(bounds.y[0], p.y)),
  });

  read();
  const at = (index: number) => Math.min(snaps.length - 1, Math.max(0, Math.round(index)));
  let current: number | null = snaps.length ? at(options.initial ?? 0) : null;
  let position: DragPoint = current === null ? { ...ZERO } : { ...snaps[current] };
  let velocity: DragPoint = { ...ZERO };
  /** Where it heads, or last headed: what a flight keeps going to when things are resized */
  let goal: DragPoint = position;
  let dragging = false;
  let moving = false;
  let disabled = false;
  let destroyed = false;

  const write = (p: DragPoint, v: DragPoint) => {
    position = { x: p.x, y: p.y };
    velocity = { x: v.x, y: v.y };
    element.style.translate = `${px(position.x)} ${px(position.y)}`;
    // Copies: what the page does with them is no business of the drag's
    onMove?.({ ...position }, { ...velocity });
  };

  let settling = options.spring ?? defaultDragSpring;
  let follow = options.follow ?? null;

  // A spring calls back once as it's made, before it's there; its first frame is written below
  let ready = false;
  const spring = new SpringAnimator(
    { x: position.x, y: position.y },
    settling,
    (p) => {
      // A spring that swings past the bounds is rubber there too
      if (ready) write(stretch(p), spring.velocities());
    },
    () => {
      // Caught up with a pointer that's still dragging it, on `follow`: not at rest
      if (dragging) return;
      moving = false;
      velocity = { ...ZERO };
      onRest?.();
    },
    PRECISION,
  );
  ready = true;

  /** Off to `target` at `v`, or there at once */
  const settle = (target: DragPoint, v: DragPoint, instant = false) => {
    goal = target;
    if (instant || reduced.matches) {
      // Its spring is left where it was headed: the next flight sets off from here, with `to`
      const was = moving;
      spring.stop();
      spring.jump(target, ZERO);
      moving = false;
      write(target, ZERO);
      if (was) onRest?.();
      return;
    }
    moving = true;
    spring.to(target, settling, v);
  };

  /** Where it comes to rest let go here at `v`: the snap point nearest to where it would stop */
  const aim = (from: DragPoint, v: DragPoint) => {
    const end = { x: from.x + project(v.x, rate), y: from.y + project(v.y, rate) };
    if (!snaps.length) return { index: null, target: clamp(end) };
    let index = 0;
    let best = Infinity;
    snaps.forEach((s, i) => {
      const d = Math.hypot(s.x - end.x, s.y - end.y);
      if (d < best) [best, index] = [d, i];
    });
    return { index, target: snaps[index] };
  };

  /**
   * Screen pixels per pixel of its own: how its ancestors scale it. Its own `scale` and `transform`
   * don't count: they don't scale its `translate`
   */
  const scaleOf = () => {
    const parent = element.parentElement;
    if (!parent?.offsetWidth) return 1;
    return parent.getBoundingClientRect().width / parent.offsetWidth || 1;
  };

  /** The area inside that scrolls along its axis, and hands gestures over with it */
  const area = axis === "both" ? null : (options.scroll ?? null);
  const k: "x" | "y" = axis === "x" ? "x" : "y";
  const scrolled = () => (!area ? 0 : k === "y" ? area.scrollTop : area.scrollLeft);
  const scrollEnd = () =>
    !area ? 0 : k === "y" ? area.scrollHeight - area.clientHeight : area.scrollWidth - area.clientWidth;
  const scrollTo = (v: number) => {
    if (!area) return;
    if (k === "y") area.scrollTop = v;
    else area.scrollLeft = v;
  };

  // On touch the browser keeps the other axis, and pinching. With a scroll area, fingers are followed
  // by their touch events instead, which stop the browser's scroll themselves: a `touch-action`
  // here would be one the area's own scroll has to get past
  if (!area) handle.style.touchAction = axis === "x" ? "pan-y pinch-zoom" : axis === "y" ? "pan-x pinch-zoom" : "none";

  /** The pointer down on the handle, until it's let go or given up */
  let pointer: {
    id: number;
    touch: boolean;
    /** A finger followed by its touch events (with a scroll area): not a pointer the browser takes */
    viaTouch: boolean;
    /** Where it was when the drag started, on screen */
    x0: number;
    y0: number;
    /** The pull it started from */
    from: DragPoint;
    /** Screen pixels per pixel of the element */
    scale: number;
    /** The drag has it: the element follows it, or is held, caught on its way */
    started: boolean;
    /** It has moved past the slop: a drag, not a tap */
    moved: boolean;
    /** Where it was lately, for its speed */
    samples: Sample[];
  } | null = null;

  const listen = (on: boolean) => {
    if (on) {
      win.addEventListener("pointermove", movedPointer, true);
      win.addEventListener("pointerup", upPointer, true);
      win.addEventListener("pointercancel", cancelledPointer, true);
      return;
    }
    win.removeEventListener("pointermove", movedPointer, true);
    win.removeEventListener("pointerup", upPointer, true);
    win.removeEventListener("pointercancel", cancelledPointer, true);
  };

  /**
   * No text is selected on the page while a pointer is down on the handle, dragging or not: given up
   * across its axis too, it's held until the pointer is let go
   */
  let unhold: (() => void) | null = null;
  const hold = () => {
    if (unhold) return;
    unhold = holdSelection(doc);
    win.addEventListener("pointerup", letGo, true);
    win.addEventListener("pointercancel", letGo, true);
  };
  const letGo = () => {
    win.removeEventListener("pointerup", letGo, true);
    win.removeEventListener("pointercancel", letGo, true);
    unhold?.();
    unhold = null;
  };

  /**
   * The pointer is done: let go at `v`, or with `null` nothing else happens (`snap()`, `to()` and
   * `destroy()` take over)
   */
  const finish = (v: DragPoint | null, from: DragPoint = position) => {
    const was = pointer;
    pointer = null;
    listen(false);
    if (!was?.started) return;
    claimed.delete(was.id);
    dragging = false;
    element.removeAttribute(DRAGGING);
    try {
      handle.releasePointerCapture(was.id);
    } catch {
      // Not captured, or gone
    }
    if (!v) return;
    // Caught, and let go without being moved: a tap. It goes on where it was going; the click is
    // the page's
    if (!was.moved) {
      settle(goal, ZERO);
      return;
    }
    const { index, target } = aim(from, v);
    current = index;
    onEnd?.(index);
    settle(target, v);
  };

  /** The drag takes the pointer: dragged from here (`moved`), or caught on its way and held */
  const begin = (input: Input, moved: boolean) => {
    if (!pointer) return;
    // A drag inside its handle has it already
    if (claimed.has(pointer.id)) {
      finish(null);
      return;
    }
    claimed.add(pointer.id);
    read();
    spring.stop();
    dragging = true;
    moving = true;
    pointer.started = true;
    pointer.moved = moved;
    pointer.x0 = input.x;
    pointer.y0 = input.y;
    pointer.from = unstretch(position);
    pointer.samples = [{ t: input.t, x: position.x, y: position.y }];
    if (!pointer.viaTouch) {
      try {
        handle.setPointerCapture(input.id);
      } catch {
        // A pointer that's gone already
      }
    }
    element.setAttribute(DRAGGING, "");
    onStart?.();
  };

  /** The speed from the first sample to the last, px/s */
  const speed = (samples: Sample[]): DragPoint => {
    if (samples.length < 2) return { ...ZERO };
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : { ...ZERO };
  };

  /**
   * Whether it's on its way, to be caught: moving visibly. Moving still, but as good as there, it's
   * put there now, and a pointer down finds it at rest
   */
  const inFlight = () => {
    if (!moving || dragging) return moving;
    const far = Math.hypot(goal.x - position.x, goal.y - position.y);
    if (far > CATCH_DISTANCE || Math.hypot(velocity.x, velocity.y) > CATCH_SPEED) return true;
    settle(goal, ZERO, true);
    return false;
  };

  /** A pointer goes down on the handle: followed from here */
  const press = (input: Input, viaTouch: boolean) => {
    hold();
    pointer = {
      id: input.id,
      touch: input.touch,
      viaTouch,
      x0: input.x,
      y0: input.y,
      from: position,
      scale: scaleOf(),
      started: false,
      moved: false,
      samples: [],
    };
    if (!viaTouch) listen(true);
    // Caught on its way: it stops under the pointer
    if (inFlight()) begin(input, false);
  };

  const move = (input: Input) => {
    if (!pointer || input.id !== pointer.id) return;
    let dx = (input.x - pointer.x0) / pointer.scale;
    let dy = (input.y - pointer.y0) / pointer.scale;
    if (!pointer.moved) {
      const slop = pointer.touch ? TOUCH_SLOP : SLOP;
      const far = Math.hypot(dx, dy);
      if (far < slop) return;
      const down = { x: pointer.x0, y: pointer.y0 };
      if (pointer.started) {
        // Caught, and now dragged
        pointer.moved = true;
        pointer.samples = [{ t: input.t, x: position.x, y: position.y }];
      } else {
        // Across its axis first: the page's, such as a list scrolled past a row that swipes
        if ((axis === "x" && Math.abs(dy) > Math.abs(dx)) || (axis === "y" && Math.abs(dx) > Math.abs(dy))) {
          finish(null);
          return;
        }
        begin(input, true);
        // Another drag has it
        if (!pointer) return;
      }
      // Dragged from the edge of the slop: only the slop is lost, not the rest of a first move that
      // went far at once (a pointer flung)
      const past = slop / far;
      pointer.x0 = down.x + (input.x - down.x) * past;
      pointer.y0 = down.y + (input.y - down.y) * past;
      dx = (input.x - pointer.x0) / pointer.scale;
      dy = (input.y - pointer.y0) / pointer.scale;
    }
    const raw = handOver({ x: pointer.from.x + (onX ? dx : 0), y: pointer.from.y + (onY ? dy : 0) });
    const shown = stretch(raw);
    const samples = pointer.samples;
    samples.push({ t: input.t, x: shown.x, y: shown.y });
    while (samples.length > 2 && samples[0].t < input.t - VELOCITY_WINDOW) samples.shift();
    // Chasing the pointer on its own spring, which writes it: where it shows, within its bounds, so
    // a pointer flung far past an end doesn't fling it across in a frame
    if (follow) {
      spring.to(shown, follow);
      return;
    }
    // The spring holds the pull, as it shows it stretched: let go past the bounds, it sets off from there
    spring.jump(raw);
    write(shown, speed(samples));
  };

  /** A drag ends in a click where it's let go: not a press of what's under it */
  let unswallow = () => {};

  const release = (input: Input) => {
    if (!pointer || input.id !== pointer.id) return;
    if (pointer.moved) {
      unswallow();
      unswallow = swallowClick(doc, null, CLICK_WINDOW);
    }
    // Its speed as it was let go: a pointer that stopped a while before has none. Where it's
    // thrown is judged from the pointer, so following on a spring, a quick flick still flips it
    const v = pointer.started ? speed(pointer.samples.filter((s) => s.t >= input.t - VELOCITY_WINDOW)) : null;
    const last = pointer.samples[pointer.samples.length - 1];
    finish(v, follow && pointer.moved && last ? { x: last.x, y: last.y } : position);
  };

  /** Taken by the browser (a scroll, a gesture of its own): it settles from where it is */
  const cancel = (id: number) => {
    if (!pointer || id !== pointer.id) return;
    finish(pointer.started ? { ...ZERO } : null);
  };

  const fromPointer = (e: PointerEvent): Input => ({
    id: e.pointerId,
    touch: e.pointerType === "touch",
    x: e.clientX,
    y: e.clientY,
    t: e.timeStamp,
  });

  const down = (e: PointerEvent) => {
    if (disabled || destroyed || pointer || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element | null)?.closest?.(NO_DRAG)) return;
    // With a scroll area, a finger is followed by its touch events, which can stop the scroll
    if (area && e.pointerType === "touch") return;
    press(fromPointer(e), false);
  };
  const movedPointer = (e: PointerEvent) => {
    if (!pointer?.viaTouch) move(fromPointer(e));
  };
  const upPointer = (e: PointerEvent) => {
    if (!pointer?.viaTouch) release(fromPointer(e));
  };
  const cancelledPointer = (e: PointerEvent) => {
    if (!pointer?.viaTouch) cancel(e.pointerId);
  };

  /**
   * A finger dragging it from the scroll area, the element at the start of its bounds (a sheet all
   * the way open): the rest of the push scrolls the area on; pulled back, the area scrolls back to
   * its start before the element moves
   */
  const handOver = (raw: DragPoint): DragPoint => {
    if (!area || !pointer?.viaTouch) return raw;
    const lo = bounds[k][0];
    const at = scrolled();
    let shift = 0;
    if (raw[k] < lo && at < scrollEnd()) shift = Math.min(lo - raw[k], scrollEnd() - at);
    else if (raw[k] > lo && at > 0 && position[k] <= lo + 0.5) shift = -Math.min(raw[k] - lo, at);
    if (!shift) return raw;
    scrollTo(at + shift);
    pointer.from = { ...pointer.from, [k]: pointer.from[k] + shift };
    return { ...raw, [k]: raw[k] + shift };
  };

  /**
   * A finger on the handle, with a scroll area, followed by its touch events: they can stop the
   * area's scroll, which a pointer can't once the browser has it. Undecided until it has moved a
   * little; then the drag's, the area's to scroll, or neither's (across the axis)
   */
  let touch: {
    id: number;
    /** It went down in the scroll area */
    inArea: boolean;
    mode: "undecided" | "drag" | "scroll" | "none";
    x0: number;
    y0: number;
    last: number;
  } | null = null;
  const touchInput = (t: Touch, time: number): Input => ({
    // Apart from pointers' ids
    id: -1 - t.identifier,
    touch: true,
    x: t.clientX,
    y: t.clientY,
    t: time,
  });
  const ours = (e: TouchEvent) => [...e.changedTouches].find((t) => t.identifier === touch?.id);
  /** The drag takes the finger, here */
  const takeTouch = (input: Input) => {
    if (!touch) return;
    touch.mode = "drag";
    if (!pointer) press(input, true);
    if (!pointer?.started) begin(input, true);
    // Another drag had it
    if (!pointer) touch.mode = "none";
  };

  const touchStart = (e: TouchEvent) => {
    // A second finger: not a drag's
    if (e.touches.length > 1) {
      if (pointer?.viaTouch) cancel(pointer.id);
      touch = null;
      letGo();
      return;
    }
    if (disabled || destroyed || pointer) return;
    const t = e.changedTouches[0];
    if ((t.target as Element | null)?.closest?.(NO_DRAG)) return;
    const along = k === "y" ? t.clientY : t.clientX;
    const inArea = !!area?.contains(t.target as Node);
    touch = { id: t.identifier, inArea, mode: "undecided", x0: t.clientX, y0: t.clientY, last: along };
    // Before it's decided too: a finger held still doesn't select text either
    hold();
    // Caught on its way: held, as any pointer catches it
    if (inFlight()) {
      touch.mode = "drag";
      press(touchInput(t, e.timeStamp), true);
    }
  };

  const touchMove = (e: TouchEvent) => {
    const t = ours(e);
    if (!t || !touch) return;
    const input = touchInput(t, e.timeStamp);
    const along = k === "y" ? t.clientY : t.clientX;
    const step = along - touch.last;
    touch.last = along;
    if (touch.mode === "undecided") {
      const dx = t.clientX - touch.x0;
      const dy = t.clientY - touch.y0;
      if (Math.hypot(dx, dy) < DECIDE) return;
      const forward = k === "y" ? dy : dx;
      if (Math.abs(k === "y" ? dx : dy) > Math.abs(forward)) {
        touch.mode = "none";
        return;
      }
      // Out of the area, the element's. In it: pulled toward its later snap points with the area at
      // its start, or pushed back while it isn't at the start of its bounds. Else the area scrolls
      const take = !touch.inArea || (forward > 0 ? scrolled() <= 0 : position[k] > bounds[k][0] + 0.5);
      if (take) takeTouch(input);
      else touch.mode = "scroll";
    } else if (touch.mode === "scroll") {
      // Scrolled back to its start and still pulled: the element's, if the browser lets go of the
      // scroll (a scroll under way can't be stopped everywhere)
      if (step > 0 && scrolled() <= 0 && e.cancelable) takeTouch(input);
    }
    if (touch.mode !== "drag") return;
    if (!pointer) {
      // Taken by `snap()`, `to()` or `disabled`
      touch.mode = "none";
      return;
    }
    e.preventDefault();
    move(input);
  };

  const touchEnd = (e: TouchEvent) => {
    const t = ours(e);
    if (!t) return;
    if (pointer?.viaTouch) {
      if (e.type === "touchcancel") cancel(pointer.id);
      else release(touchInput(t, e.timeStamp));
    }
    touch = null;
    letGo();
  };

  /** Where fingers are followed: the handle, and the area too if it isn't in the handle */
  const touched = !area ? [] : handle.contains(area) ? [handle] : [handle, area];
  for (const el of touched) {
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("touchcancel", touchEnd);
  }

  /** A link or an image in the handle isn't dragged off by the browser while a pointer is down */
  const nativeDrag = (e: DragEvent) => {
    if (pointer) e.preventDefault();
  };

  /**
   * A finger the drag has: the page doesn't scroll under it. `touch-action` leaves the other axis to
   * the browser for a gesture that sets off that way, but Safari starts a scroll mid-drag too, as
   * soon as the finger strays across, and takes the pointer
   */
  const holdScroll = (e: TouchEvent) => {
    if (pointer?.started && !pointer.viaTouch && e.cancelable) e.preventDefault();
  };

  handle.addEventListener("pointerdown", down);
  handle.addEventListener("touchmove", holdScroll, { passive: false });
  handle.addEventListener("dragstart", nativeDrag);

  /** Its snap points or bounds moved: it follows, to the same point, or within them */
  const relayout = () => {
    if (destroyed) return;
    read();
    if (dragging) return;
    if (current !== null) current = snaps.length ? at(current) : null;
    const target = current !== null ? snaps[current] : clamp(goal);
    if (moving) {
      goal = target;
      spring.retarget(target);
    } else if (target.x !== position.x || target.y !== position.y) settle(target, ZERO, true);
  };
  const resized = new ResizeObserver(() => relayout());
  resized.observe(element);
  if (element.parentElement) resized.observe(element.parentElement);
  // Snap points from the window's size, such as a sheet's "half the screen"
  win.addEventListener("resize", relayout);

  write(position, ZERO);

  return {
    get position() {
      return { ...position };
    },
    get velocity() {
      return { ...velocity };
    },
    get dragging() {
      return dragging;
    },
    get moving() {
      return moving;
    },
    get current() {
      return current;
    },
    get disabled() {
      return disabled;
    },
    set disabled(value) {
      disabled = value;
      if (value && pointer) finish(pointer.started ? { ...ZERO } : null);
    },
    snap(index, move = {}) {
      if (destroyed || !snaps.length) return;
      if (pointer) finish(null);
      current = at(index);
      settle(snaps[current], move.velocity === undefined ? velocity : point(move.velocity), move.instant);
    },
    to(target, move = {}) {
      if (destroyed) return;
      if (pointer) finish(null);
      current = null;
      settle(clamp(point(target)), move.velocity === undefined ? velocity : point(move.velocity), move.instant);
    },
    update: relayout,
    set(next) {
      if ("onStart" in next) onStart = next.onStart;
      if ("onMove" in next) onMove = next.onMove;
      if ("onEnd" in next) onEnd = next.onEnd;
      if ("onRest" in next) onRest = next.onRest;
      if ("rubberband" in next) rubber = rubberOf(next.rubberband);
      if ("deceleration" in next) rate = rateOf(next.deceleration);
      if ("spring" in next) settling = next.spring ?? defaultDragSpring;
      if ("follow" in next) follow = next.follow ?? null;
      if ("snaps" in next || "bounds" in next) {
        given = {
          snaps: "snaps" in next ? next.snaps : given.snaps,
          bounds: "bounds" in next ? next.bounds : given.bounds,
        };
        relayout();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (pointer) finish(null);
      touch = null;
      letGo();
      spring.stop();
      unswallow();
      resized.disconnect();
      win.removeEventListener("resize", relayout);
      handle.removeEventListener("pointerdown", down);
      handle.removeEventListener("touchmove", holdScroll);
      handle.removeEventListener("dragstart", nativeDrag);
      for (const el of touched) {
        el.removeEventListener("touchstart", touchStart);
        el.removeEventListener("touchmove", touchMove);
        el.removeEventListener("touchend", touchEnd);
        el.removeEventListener("touchcancel", touchEnd);
      }
      element.removeAttribute(DRAGGING);
      element.style.translate = own.translate;
      handle.style.touchAction = own.touchAction;
    },
  };
}

import {
  PART,
  SpringAnimator,
  cornerOf,
  cornerShapeOf,
  drawsCornerShape,
  fitRadii,
  px,
  radiiCss,
  radiiOf,
  still,
  swallowClick,
  holdSelection,
  type Radii,
  type SpringParams,
} from "../base.js";

/**
 * Indicator: one element that flies onto whichever item is hovered, pressed, focused or chosen, as
 * the highlight of a menu, the thumb of tabs, the pill of a segmented control. The items stay
 * as they are; only the indicator moves: its center, size and corners on springs that keep their
 * speed when turned elsewhere, so a pointer sweeping across a menu is followed without a stutter.
 *
 * It goes from item to item, never in between: over a gap or a separator it stays on the last one,
 * and once the pointer is over the next it's there in a few frames, blurred by its own speed on the
 * way (as iOS does), so crossing a separator is a blur over it, not a stop. It shows up on its item
 * at once; going away, it fades as it lands on the item it was headed for, so a pointer swept past
 * leaves it on the last item it was over. Over a disabled item it goes away. Each item lends it its corners (a capsule button, a capsule indicator); an item with
 * square corners lends it the indicator's own.
 *
 * What moves it (`trigger`):
 *   - hover: the item under a hovering pointer (mouse, pen), until the pointer leaves the container
 *   - press: the item under a pressing pointer, followed across items while it's down, out of the
 *     container and back too (out of the items, it stays on the last one). On touch it shows
 *     after a short delay, so a finger that lands to scroll shows nothing; released over another
 *     item than it went down on, that item is clicked, as in an iOS menu (`click`)
 *   - auto (the default): hover for a mouse or a pen, press for a finger, per event, so a tablet
 *     with a trackpad gets both
 *   - manual: nothing but `to()`
 * Unless manual, keyboard focus that shows (`:focus-visible`) moves it too. When nothing points, it
 * goes back to `rest` (the chosen tab), or away if there's none. While a pointer is down on its item
 * (a press, or a click on the hovered one) the indicator is marked `data-pressed`, for the page to
 * show: a deeper shade, say.
 *
 * The indicator is the page's own element, styled by the page, absolutely positioned in the
 * container (which needs a position of its own) and under its items: the container isolated, the
 * indicator at `z-index: -1`, or the items positioned above it. While it runs, its inline position,
 * size, corners, opacity, filter and visibility are the indicator's; it's marked `data-fk-part`
 * (made by a module: press behaviors don't press it, a morph doesn't count it as a neighbor).
 *
 * Items are measured once, at rest (without their own inline transforms: a swollen button is
 * measured as it is unpressed), in the indicator's own pixels, and again when anything in the
 * container is resized or changed. A pointer is hit-tested against those boxes: nothing is laid out
 * while it moves. Per frame the indicator alone is written to, its size laid out inside it alone.
 * With reduced motion it moves at once.
 */

/** The indicator's center, its size, and how present it is: 0 away, 1 there */
type Channel = "cx" | "cy" | "w" | "h" | "p";
type Frame = Record<Channel, number>;

/**
 * Springs for the center's travel (`x`, `y`), the size (`width`, `height`), and going away
 * (`presence`): it comes at once
 */
export type IndicatorSprings = {
  x: SpringParams;
  y: SpringParams;
  width: SpringParams;
  height: SpringParams;
  presence: SpringParams;
};

export type IndicatorTrigger = "auto" | "hover" | "press" | "manual";

export type IndicatorOptions = {
  /** Where its items are; the indicator is positioned in it */
  container: HTMLElement;
  /** The element that moves: the page's own, absolutely positioned in the container */
  indicator: HTMLElement;
  /**
   * Its items, as a selector in the container. Unless given, the container's children, but for
   * the indicator and separators (`hr`, `[role="separator"]`)
   */
  items?: string;
  /** What moves it: `auto` (the default), `hover`, `press` or `manual` */
  trigger?: IndicatorTrigger;
  /** Where it stays when nothing points: the chosen item. Away unless given */
  rest?: HTMLElement | null;
  /** Released over another item than it went down on, that item is clicked; on unless `false` */
  click?: boolean;
  /** Keyboard focus that shows moves it; on unless `false` or manual */
  focus?: boolean;
  /** Springs; any left out are the defaults' */
  spring?: Partial<IndicatorSprings>;
  /** Called when it heads for another item, or away (`null`) */
  onChange?: (item: HTMLElement | null) => void;
};

/** `instant`: there at once, as with reduced motion */
export type IndicatorMove = { instant?: boolean };

/** What an indicator can be told again once made: all but its container, indicator and rest (a property of its own) */
export type IndicatorSettings = Omit<IndicatorOptions, "container" | "indicator" | "rest">;

export type Indicator = {
  /** The item it's on or headed for; `null` while away */
  readonly current: HTMLElement | null;
  /** Where it stays when nothing points; set it when the choice changes, and it goes there */
  rest: HTMLElement | null;
  /** Onto `item`, or away with `null` */
  to(item: HTMLElement | null, move?: IndicatorMove): void;
  /** Measures the items again and follows them: for one moved by something unseen */
  update(): void;
  /**
   * Takes new settings, the rest kept: a component's props as they change, without an indicator
   * made again. A new trigger takes over at once; what pointed at it before lets go
   */
  set(settings: Partial<IndicatorSettings>): void;
  destroy(): void;
};

/**
 * The springs it runs on unless given others: quick and without overshoot, most of the way from one
 * item to the next in three or four frames, as iOS menus are. Slower reads as lagging the pointer.
 */
export const defaultIndicatorSprings: IndicatorSprings = {
  x: { duration: 0.1, bounce: 0 },
  y: { duration: 0.1, bounce: 0 },
  width: { duration: 0.11, bounce: 0 },
  height: { duration: 0.11, bounce: 0 },
  presence: { duration: 0.12, bounce: 0 },
};

/** Where it's done: a quarter of a pixel, and a presence whose last bit moves nothing visible */
const PRECISION = { cx: 0.25, cy: 0.25, w: 0.25, h: 0.25, p: 0.002 };
/** Its blur by its speed: px of blur per px/s, and at most */
const BLUR_PER_SPEED = 0.0025;
const MAX_BLUR = 6;
/** How much fainter it gets by its speed: per px/s, and at most */
const DIP_PER_SPEED = 0.00015;
const MAX_DIP = 0.3;
/** Touch shows a press after this long, ms: a finger that lands to scroll has cancelled by then */
const TOUCH_DELAY = 70;
/** How long after a release the click it replaced may still come, ms */
const CLICK_WINDOW = 400;
const SEPARATOR = "hr, [role='separator']";
/** On the indicator while a pointer is down on its item: the page's to style */
const PRESSED = "data-pressed";
const DISABLED = ":disabled, [aria-disabled='true']";
/**
 * Out of the flow, placed by transform alone; transitions of its own would lag behind the springs.
 * Its size is laid out inside it alone. A layer of its own: in Safari, blurred as it flies, it isn't
 * drawn at all without one (under glass, at least), and with its paint contained instead it leaves
 * its blurred edges behind.
 */
const PINNED =
  "position: absolute; left: 0; top: 0; right: auto; bottom: auto; margin: 0; box-sizing: border-box; " +
  "min-width: 0; min-height: 0; max-width: none; max-height: none; translate: none; rotate: none; " +
  "scale: none; transition: none; animation: none; pointer-events: none; contain: size layout style; " +
  "will-change: transform";

/** An item as measured: its box in the indicator's pixels, its corners and their shape */
type Spot = { x: number; y: number; w: number; h: number; radii: Radii; shape: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createIndicator({
  container,
  indicator,
  items: selector,
  trigger = "auto",
  rest: initialRest = null,
  click = true,
  focus: focusGiven,
  spring: given,
  onChange,
}: IndicatorOptions): Indicator {
  /** Keyboard focus moves it unless told not to, or manual */
  let focus = focusGiven ?? trigger !== "manual";
  if (!container.contains(indicator)) throw new Error("indicator: it has to be in its container");
  const doc = container.ownerDocument;
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const cornerShapes = drawsCornerShape(win);
  const channelsOf = (set?: Partial<IndicatorSprings>): Record<Channel, SpringParams> => {
    const springs = { ...defaultIndicatorSprings, ...set };
    return { cx: springs.x, cy: springs.y, w: springs.width, h: springs.height, p: springs.presence };
  };
  let channels = channelsOf(given);

  // Its own corners, for items with none, read before any are written
  const ownStyle = win.getComputedStyle(indicator);
  const ownCorners = [
    ownStyle.borderTopLeftRadius,
    ownStyle.borderTopRightRadius,
    ownStyle.borderBottomRightRadius,
    ownStyle.borderBottomLeftRadius,
  ];
  const ownShape = cornerShapes ? cornerShapeOf(ownStyle) : 1;
  const own = {
    style: indicator.getAttribute("style"),
    part: indicator.hasAttribute(PART),
    hidden: indicator.getAttribute("aria-hidden"),
  };
  indicator.style.cssText += `; ${PINNED}`;
  indicator.setAttribute(PART, "");
  indicator.setAttribute("aria-hidden", "true");

  /** The items, as they are now */
  const list = (): HTMLElement[] =>
    (selector ? [...container.querySelectorAll(selector)] : [...container.children]).filter(
      (el): el is HTMLElement =>
        el !== indicator && el.nodeType === 1 && !el.matches(SEPARATOR) && !el.hasAttribute(PART),
    );

  /**
   * Where the indicator's own pixels are on screen: its containing block's padding box, scrolled,
   * and how much it's scaled there (a container on its way in, magnified)
   */
  const frame = () => {
    const cb = (indicator.offsetParent as HTMLElement | null) ?? container;
    const r = cb.getBoundingClientRect();
    // offsetWidth is rounded: a box 300.4px wide isn't scaled by 1.0013, which would put the
    // indicator a fraction of a pixel off its item, and more off as the box grows
    const scale = cb.offsetWidth && Math.abs(r.width - cb.offsetWidth) >= 1 ? r.width / cb.offsetWidth : 1;
    return {
      left: r.left + (cb.clientLeft - cb.scrollLeft) * scale,
      top: r.top + (cb.clientTop - cb.scrollTop) * scale,
      scale: scale || 1,
    };
  };

  /** The items measured, until something in the container changes */
  let spots: Map<HTMLElement, Spot> | null = null;
  /** The container and the items measured so far, watched for their size */
  const watched = new Set<Element>();
  const resized = new ResizeObserver(() => relayout());
  const measure = () => {
    const f = frame();
    const next = new Map<HTMLElement, Spot>();
    // All reads first, then the corners from them: one layout
    const found = list().map((item) => [item, still(item, () => item.getBoundingClientRect())] as const);
    for (const [item, r] of found) {
      if (!r.width || !r.height) continue;
      const w = r.width / f.scale;
      const h = r.height / f.scale;
      const style = win.getComputedStyle(item);
      const radii = radiiOf(style, w, h);
      const square = radii.every((v) => v === 0);
      next.set(item, {
        x: (r.left - f.left) / f.scale,
        y: (r.top - f.top) / f.scale,
        w,
        h,
        radii: square ? fitRadii(ownCorners.map((v) => cornerOf(v, w, h)) as Radii, w, h) : radii,
        shape: !cornerShapes ? 1 : square ? ownShape : cornerShapeOf(style),
      });
      if (!watched.has(item)) {
        watched.add(item);
        resized.observe(item);
      }
    }
    spots = next;
    return next;
  };
  const spotOf = (item: HTMLElement) => (spots ?? measure()).get(item);

  /**
   * The item under a point on screen: an item, `null` over a disabled one, `undefined` over none
   * (a gap, a separator, past the items)
   */
  const hit = (clientX: number, clientY: number) => {
    const all = spots ?? measure();
    const f = frame();
    const x = (clientX - f.left) / f.scale;
    const y = (clientY - f.top) / f.scale;
    for (const [item, s] of all) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return item.matches(DISABLED) ? null : item;
    }
    return undefined;
  };

  let target: HTMLElement | null = null;
  let restAt = initialRest;
  /** The corners it's drawn with: its item's, kept while it goes away */
  let corners: Radii = [0, 0, 0, 0];
  let shape = 1;
  let motion: SpringAnimator<Channel> | null = null;
  /** Where it was last sent */
  let aim: Frame | null = null;
  let destroyed = false;

  const render = (f: Frame) => {
    const w = Math.max(0, f.w);
    const h = Math.max(0, f.h);
    const p = clamp01(f.p);
    const v = motion?.velocities();
    const speed = v ? Math.hypot(v.cx, v.cy) : 0;
    const blur = Math.min(MAX_BLUR, speed * BLUR_PER_SPEED);
    const s = indicator.style;
    s.transform = `translate(${px(f.cx - w / 2)}, ${px(f.cy - h / 2)})`;
    s.width = px(w);
    s.height = px(h);
    s.borderRadius = radiiCss(fitRadii(corners, w, h));
    if (shape !== 1) s.setProperty("corner-shape", `superellipse(${shape})`);
    else s.removeProperty("corner-shape");
    s.opacity = String(Math.round(p * (1 - Math.min(MAX_DIP, speed * DIP_PER_SPEED)) * 1000) / 1000);
    s.filter = blur > 0.33 ? `blur(${px(blur)})` : "";
    s.visibility = p < 0.001 ? "hidden" : "";
  };

  /** Where it goes for a spot: on it, there */
  const goalOf = (spot: Spot): Frame => ({
    cx: spot.x + spot.w / 2,
    cy: spot.y + spot.h / 2,
    w: spot.w,
    h: spot.h,
    p: 1,
  });

  const go = (item: HTMLElement | null, instant = false) => {
    if (destroyed) return;
    const spot = item ? spotOf(item) : undefined;
    if (!spot) item = null;
    const changed = item !== target;
    const was = target ? spotOf(target) : undefined;
    target = item;
    const now = motion!.values();
    let goal: Frame;
    if (spot) {
      goal = goalOf(spot);
      corners = spot.radii;
      shape = spot.shape;
      // Away until now: it's on its item at once, as iOS shows it, not fading in or flying from where it left
      if (now.p < 0.01) motion!.jump(goal, { cx: 0, cy: 0, w: 0, h: 0, p: 0 });
    } else {
      // Going away, it still lands where it was headed: swept past, it fades on the last item the
      // pointer was over, not somewhere on the way to it
      goal = { ...(was ? goalOf(was) : now), p: 0 };
    }
    aim = goal;
    motion!.to(goal, channels);
    if (instant || reduced.matches) {
      motion!.jump(goal, { cx: 0, cy: 0, w: 0, h: 0, p: 0 });
      render(goal);
    }
    if (changed) onChange?.(item);
  };

  // At rest where it rests, or away
  const first = initialRest ? spotOf(initialRest) : undefined;
  if (first) aim = goalOf(first);
  if (first) {
    target = initialRest;
    corners = first.radii;
    shape = first.shape;
  }
  motion = new SpringAnimator<Channel>(
    first ? goalOf(first) : { cx: 0, cy: 0, w: 0, h: 0, p: 0 },
    channels,
    render,
    undefined,
    PRECISION,
  );

  /** What points at it now: a hovering pointer, a pressing one, keyboard focus; it rests otherwise */
  let session: "hover" | "press" | "focus" | null = null;
  const back = () => {
    session = null;
    go(restAt && restAt.isConnected ? restAt : null);
  };

  /** A press under way: its pointer, the item it went down on, where it is, whether it shows yet */
  let press: { id: number; down: HTMLElement | null | undefined; x: number; y: number; shown: boolean } | null = null;
  let showTimer = 0;
  let backTimer = 0;
  /** Stops dropping the browser's click after a release that clicked an item itself */
  let unswallow = () => {};

  /** Whether a pointer moves it by hovering or by pressing */
  const kindOf = (e: PointerEvent): "hover" | "press" | null =>
    trigger === "manual"
      ? null
      : trigger === "hover"
        ? e.pointerType === "touch"
          ? null
          : "hover"
        : trigger === "press" || e.pointerType === "touch"
          ? "press"
          : "hover";

  /** Onto the item under a point; over none it stays */
  const follow = (clientX: number, clientY: number) => {
    const item = hit(clientX, clientY);
    if (item !== undefined && item !== target) go(item);
  };

  /** A pressing pointer, anywhere on the page: out of the container and back, it's still followed */
  const onPressMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    // A mouse or pen let go where its release never reached us (a drag the browser took over,
    // such as text it started selecting): the press is over, nothing chosen
    if (e.pointerType !== "touch" && e.buttons === 0) return cancel();
    press.x = e.clientX;
    press.y = e.clientY;
    if (press.shown) follow(e.clientX, e.clientY);
  };

  const onMove = (e: PointerEvent) => {
    if (press || kindOf(e) !== "hover") return;
    win.clearTimeout(backTimer);
    session = "hover";
    follow(e.clientX, e.clientY);
  };

  const onLeave = (e: PointerEvent) => {
    if (session === "hover" && !press && kindOf(e) === "hover") back();
  };

  /** Pressed: the indicator marked `data-pressed`, for the page to show it */
  const pressed = (on: boolean) => {
    if (on) indicator.setAttribute(PRESSED, "");
    else indicator.removeAttribute(PRESSED);
  };
  /** A hovering pointer held down on an item: marked pressed until it lets go */
  let held: number | null = null;
  const release = (e?: Event) => {
    if (e instanceof PointerEvent && e.pointerId !== held) return;
    held = null;
    pressed(false);
    doc.removeEventListener("pointerup", release, true);
    doc.removeEventListener("pointercancel", release, true);
    doc.removeEventListener("dragstart", release, true);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const kind = kindOf(e);
    if (kind === "hover") {
      // Pressed on the item it's on: the click is the page's, the look of it the indicator's
      if (!hit(e.clientX, e.clientY)) return;
      release();
      held = e.pointerId;
      pressed(true);
      doc.addEventListener("pointerup", release, true);
      doc.addEventListener("pointercancel", release, true);
      doc.addEventListener("dragstart", release, true);
      return;
    }
    if (kind !== "press") return;
    win.clearTimeout(showTimer);
    win.clearTimeout(backTimer);
    press = { id: e.pointerId, down: hit(e.clientX, e.clientY), x: e.clientX, y: e.clientY, shown: false };
    // Dragged across the items, it doesn't select the page's text on the way
    unhold?.();
    unhold = holdSelection(doc);
    session = "press";
    const show = () => {
      if (!press) return;
      press.shown = true;
      pressed(true);
      follow(press.x, press.y);
    };
    if (e.pointerType === "touch") showTimer = win.setTimeout(show, TOUCH_DELAY);
    else show();
    doc.addEventListener("pointermove", onPressMove, true);
    doc.addEventListener("pointerup", onUp, true);
    doc.addEventListener("pointercancel", onUp, true);
    doc.addEventListener("dragstart", cancel, true);
  };
  /** Lets go of the page's text selection, held while a press goes across the items */
  let unhold: (() => void) | null = null;

  /** The press is over: listeners off, its pending show too */
  const stop = () => {
    unhold?.();
    unhold = null;
    doc.removeEventListener("pointermove", onPressMove, true);
    doc.removeEventListener("pointerup", onUp, true);
    doc.removeEventListener("pointercancel", onUp, true);
    doc.removeEventListener("dragstart", cancel, true);
    win.clearTimeout(showTimer);
    press = null;
    pressed(false);
  };
  /** Over without a choice: cancelled, or taken over by the browser */
  const cancel = () => {
    if (!press) return;
    stop();
    back();
  };

  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    if (e.type === "pointercancel") return cancel();
    const { down } = press;
    stop();
    const item = hit(e.clientX, e.clientY);
    // Released over another item: it's that one's click. The browser's own, if any, goes to an
    // ancestor of both and is dropped
    if (click && item && item !== down) {
      unswallow();
      unswallow = swallowClick(doc, item, CLICK_WINDOW);
      item.click();
    }
    // After the click, which may choose another rest
    backTimer = win.setTimeout(back, 0);
  };

  /** The item holding `el`, if any */
  const itemOf = (el: Element | null) => {
    if (!el) return null;
    for (const item of spots?.keys() ?? measure().keys()) if (item.contains(el)) return item;
    return null;
  };
  const shows = (el: Element) => {
    try {
      return el.matches(":focus-visible");
    } catch {
      return false;
    }
  };
  const onFocusIn = (e: FocusEvent) => {
    if (session === "hover" || session === "press") return;
    const el = e.target as Element;
    const item = itemOf(el);
    if (!item || !shows(el)) return;
    session = "focus";
    go(item.matches(DISABLED) ? null : item);
  };
  const onFocusOut = (e: FocusEvent) => {
    if (session === "focus" && !container.contains(e.relatedTarget as Node | null)) back();
  };

  /** Something in the container changed: measured again, and where it is followed there */
  const relayout = () => {
    spots = null;
    if (destroyed || !motion) return;
    if (target && !target.isConnected) return back();
    const spot = target ? spotOf(target) : undefined;
    if (!spot) return;
    corners = spot.radii;
    shape = spot.shape;
    const goal = goalOf(spot);
    // Resting on its item, it keeps to it exactly: an item that grows (its text changing, say) is
    // followed frame by frame, not chased by a spring a few frames behind
    if (aim && resting(aim)) motion.jump(goal, { cx: 0, cy: 0, w: 0, h: 0, p: 0 });
    aim = goal;
    motion.retarget(goal);
    if (resting(goal)) render(goal);
  };
  /** Drawn where it was sent and still there */
  const resting = (goal: Frame) => {
    const now = motion!.values();
    const v = motion!.velocities();
    return (["cx", "cy", "w", "h", "p"] as const).every((k) => Math.abs(now[k] - goal[k]) < 0.5 && Math.abs(v[k]) < 1);
  };
  resized.observe(container);
  const changed = new MutationObserver(() => {
    for (const el of watched) if (!el.isConnected) watched.delete(el);
    relayout();
  });
  changed.observe(container, { childList: true, subtree: true });

  /** Its listeners, for the trigger and focus it has now: set again when they change */
  const listen = () => {
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerleave", onLeave);
    container.removeEventListener("pointerdown", onDown);
    container.removeEventListener("focusin", onFocusIn);
    container.removeEventListener("focusout", onFocusOut);
    if (trigger !== "manual") {
      container.addEventListener("pointermove", onMove);
      container.addEventListener("pointerleave", onLeave);
      container.addEventListener("pointerdown", onDown);
    }
    if (focus) {
      container.addEventListener("focusin", onFocusIn);
      container.addEventListener("focusout", onFocusOut);
    }
  };
  listen();

  return {
    get current() {
      return target;
    },
    get rest() {
      return restAt;
    },
    set rest(item) {
      restAt = item;
      if (!session) {
        win.clearTimeout(backTimer);
        go(item);
      }
    },
    to(item, { instant = false } = {}) {
      go(item, instant);
    },
    update: relayout,
    set(next) {
      if (destroyed) return;
      if ("onChange" in next) onChange = next.onChange;
      if ("click" in next) click = next.click ?? true;
      if ("spring" in next) channels = channelsOf(next.spring);
      if ("items" in next) {
        selector = next.items;
        relayout();
      }
      if ("trigger" in next || "focus" in next) {
        if ("trigger" in next) trigger = next.trigger ?? "auto";
        if ("focus" in next) focusGiven = next.focus;
        focus = focusGiven ?? trigger !== "manual";
        // What pointed at it under the old ones lets go: it goes back to rest
        if (session) back();
        listen();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      motion?.stop();
      motion = null;
      win.clearTimeout(showTimer);
      win.clearTimeout(backTimer);
      unswallow();
      resized.disconnect();
      changed.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      stop();
      release();
      if (own.style === null) indicator.removeAttribute("style");
      else indicator.setAttribute("style", own.style);
      if (!own.part) indicator.removeAttribute(PART);
      if (own.hidden === null) indicator.removeAttribute("aria-hidden");
      else indicator.setAttribute("aria-hidden", own.hidden);
    },
  };
}

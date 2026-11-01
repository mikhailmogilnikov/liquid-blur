import { PART, SpringAnimator, px, springs, transitions, type SpringParams, type TransitionParams } from "../base.js";

/**
 * Layout: when a page's layout changes, its elements move to where they now are instead of
 * jumping there. Rows put in a list, taken out of it or reordered; a grid filtered; a section
 * opened; a button whose label grew. The page changes its DOM and styles as it always would; the
 * layout follows.
 *
 * It watches a root and its items (the root's children unless given a selector): their children
 * added and removed, their `class` and `hidden`, their sizes. Each change is caught before it's
 * painted. Every item that moved is shown where it was and goes to where it is on a spring
 * (`translate`), keeping its speed when the layout changes again on its way. One whose size
 * changed, and the root itself, change size for real (`width` and `height` on a spring, what's
 * past the size clipped along that axis meanwhile), so text isn't squeezed and what comes after
 * them in the page moves along with them rather than jumping. With `size: false` sizes change at
 * once and only positions move.
 *
 * A new item comes in where it is, as `enter` has it (faded and a little smaller unless told: any
 * of `transitions`); one taken out goes out where it was, as `exit` has it: the element itself,
 * put back in its place for the while, out of
 * the flow (`position: absolute`), inert, hidden from assistive technology and marked
 * `data-fk-part`, then removed. Put back in the page meanwhile, it stops going and moves from
 * there. Items there when the layout is made don't come in, and an item hidden by
 * `display: none` just goes.
 *
 * While it moves an item's inline `translate` is the layout's, added to its own (a drag's offset,
 * or its stylesheet's); `transform` is left alone, so a press stretching glass or a morph flying
 * it goes on as it does. An item being dragged (marked `data-dragging`) isn't moved. Coming in or
 * going out, its `scale` (times its own) and `opacity` are the layout's, and blurred its `filter`
 * (after its own) and `will-change`; while its size changes,
 * its `width`, `height` and what would hold them back (`min-*`, `max-*`, `box-sizing`,
 * `overflow-*`, and in a flex container `flex-grow`, `flex-shrink` and `flex-basis` along its main
 * axis). All are put back at rest.
 *
 * Changes no watcher sees (an item's `style` written, an ancestor's class moving items without
 * resizing them) are followed on `update()`. Items are boxes: an inline element takes no
 * translation. Positions are read relative to the root, its scroll included, so scrolling isn't a
 * change. A rotated or scaled ancestor isn't supported. With reduced motion everything changes
 * at once, and so it does while the root isn't drawn (hidden, in itself or an ancestor) and as it's
 * shown again.
 */

export type LayoutOptions = {
  /** The element whose items move */
  root: HTMLElement;
  /** Its items, as a selector inside it: its children unless given */
  items?: string;
  /** The spring everything moves on; `defaultLayoutSpring` unless given */
  spring?: SpringParams;
  /** Sizes change on the spring too (the default); `false`, at once, and only positions move */
  size?: boolean;
  /** How a new item comes in: `transitions.scale()` unless given; `false`, it's there at once */
  enter?: TransitionParams | false;
  /** How an item taken out goes: `transitions.scale()` unless given; `false`, it's gone at once */
  exit?: TransitionParams | false;
  /** Called when something sets off moving, from rest */
  onStart?: () => void;
  /** Called when everything has come to rest */
  onRest?: () => void;
};

/** What a layout can be told again once made */
export type LayoutSettings = Omit<LayoutOptions, "root" | "items">;

export type Layout = {
  /** Something is on its way */
  readonly moving: boolean;
  /** Reads the layout again and follows it: for a change no watcher sees */
  update(): void;
  /** Takes new settings, the rest kept */
  set(settings: Partial<LayoutSettings>): void;
  /** Stops watching; everything still moving is put where it is at once */
  destroy(): void;
};

/**
 * The spring everything moves on unless given another: snappy, as iOS 26 moves its lists (three
 * quarters of the way in a tenth of a second), landing crisp with a bounce too small to see swing
 */
export const defaultLayoutSpring: SpringParams = springs.snappy();

/** Where it's done: a quarter of a pixel, and of the way in or out a five-hundredth */
const PRECISION = { x: 0.25, y: 0.25, w: 0.25, h: 0.25, p: 0.002 };
/** Closer than this, px, it hasn't moved */
const EPSILON = 0.5;
/** On an item a drag is moving: the drag's, not the layout's */
const DRAGGING = "data-dragging";
/** What the layout writes on an item, put back as it was at rest */
const OWN = [
  "translate",
  "scale",
  "opacity",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "box-sizing",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "overflow-x",
  "overflow-y",
  "position",
  "left",
  "top",
  "margin",
  "pointer-events",
  "filter",
  "will-change",
] as const;

type Rect = { x: number; y: number; w: number; h: number };
type Channel = "x" | "y" | "w" | "h" | "p";
type Values = Record<Channel, number>;

/** An item, or the root, while it moves */
type Flight = {
  spring: SpringAnimator<Channel>;
  values: Values;
  /** Its inline styles before, put back at rest */
  own: Map<string, [string, string]>;
  /** Its own translation, scale and filter, what the layout's are added to, multiplied by, put after */
  base: { x: string; y: string; z: string; sx: number; sy: number; filter: string };
  /** Its opacity before, what coming in or going out is a part of */
  opacity: number;
  /** Which of its sizes the layout holds */
  pin: { w: boolean; h: boolean };
  /** Coming in, going out, or neither: what its progress `p` means */
  presence: "enter" | "exit" | null;
  /** Moved by the layout: the root only changes size */
  moves: boolean;
  /** Going out: its own `aria-hidden` and `inert` before, put back with the rest */
  marks?: { hidden: string | null; inert: boolean };
};

type Item = {
  el: HTMLElement;
  /** Where the layout puts it at rest, relative to the root */
  rect: Rect;
  /**
   * Where it was last drawn: what a change sets off from. By the time a change is seen the page
   * already has it elsewhere, so it can't be read then: at rest it's `rect`, on the way it's read
   * after each frame is painted
   */
  drawn: Rect;
  flight: Flight | null;
};

/** An element's own translation, scale and filter, as computed: what the layout's go on top of */
const baseOf = (style: CSSStyleDeclaration) => {
  const t = !style.translate || style.translate === "none" ? [] : style.translate.split(" ");
  const s = !style.scale || style.scale === "none" ? [] : style.scale.split(" ");
  const factor = (v: string | undefined, fallback: number) =>
    v === undefined ? fallback : v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) || 1;
  const sx = factor(s[0], 1);
  const filter = !style.filter || style.filter === "none" ? "" : style.filter;
  return { x: t[0] ?? "0px", y: t[1] ?? "0px", z: t[2] ?? "", sx, sy: factor(s[1], sx), filter };
};

const differs = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) > EPSILON ||
  Math.abs(a.y - b.y) > EPSILON ||
  Math.abs(a.w - b.w) > EPSILON ||
  Math.abs(a.h - b.h) > EPSILON;

export function createLayout(options: LayoutOptions): Layout {
  const { root, items: selector } = options;
  let {
    spring = defaultLayoutSpring,
    size = true,
    enter = transitions.scale(),
    exit = transitions.scale(),
    onStart,
    onRest,
  } = options;
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");

  const tracked = new Map<HTMLElement, Item>();
  /** Items gone from the page, going out where they were */
  const leaving = new Map<HTMLElement, Item>();
  /** Where each item was in the DOM when it was last seen taken out: to put it back there */
  const removedFrom = new Map<Node, { parent: Node; next: Node | null }>();
  /** Nodes the layout put in or took out itself: not the page's changes */
  const ours = new Set<Node>();
  /** Nodes the page put back while they were going out: where they were drawn, how far out */
  const cameBack = new Map<HTMLElement, { rect: Rect; p: number }>();
  let rootFlight: Flight | null = null;
  let rootRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let rootDrawn: Rect = rootRect;
  let reading = 0;
  let moving = false;
  let destroyed = false;

  /** The items as the page has them now: boxes, not the layout's own or another module's parts */
  const list = (): HTMLElement[] => {
    const all = selector ? [...root.querySelectorAll<HTMLElement>(selector)] : ([...root.children] as HTMLElement[]);
    return all.filter(
      (el) => !el.hasAttribute(PART) && !leaving.has(el) && win.getComputedStyle(el).display !== "none",
    );
  };

  /** The root is drawn: not hidden, in itself or an ancestor (a tab not shown), nor out of the page */
  const rendered = () => root.getClientRects().length > 0;
  /** It wasn't when the layout was last read: what it had then is nothing to move from */
  let unseen = !rendered();

  /** A box on screen, relative to the root's content: the root scrolling doesn't move it */
  const relative = (r: DOMRect, origin: DOMRect): Rect => ({
    x: r.left - origin.left + root.scrollLeft,
    y: r.top - origin.top + root.scrollTop,
    w: r.width,
    h: r.height,
  });

  /** Saves what of an element's inline style the layout may write */
  const save = (el: HTMLElement) =>
    new Map<string, [string, string]>(
      OWN.map((k) => [k, [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]]),
    );
  const putBack = (el: HTMLElement, own: Map<string, [string, string]>) => {
    for (const [k, [value, priority]] of own) {
      if (value) el.style.setProperty(k, value, priority);
      else el.style.removeProperty(k);
    }
  };

  const lookOf = (f: Flight | null) => (f?.presence === "enter" ? enter : f?.presence === "exit" ? exit : null) || null;
  /** How far it is from in, coming in or going out: 1 all the way out, 0 in */
  const awayOf = (f: Flight | null) => (f ? 1 - Math.min(1, Math.max(0, f.values.p)) : 0);
  /** How much smaller it's drawn coming in or going out */
  const scaleOf = (f: Flight | null) => 1 - (1 - (lookOf(f)?.scale ?? 1)) * awayOf(f);
  /** How far it's drawn moved coming in or going out, px */
  const offsetOf = (f: Flight | null) => {
    const look = lookOf(f);
    const away = awayOf(f);
    return { x: (look?.x ?? 0) * away, y: (look?.y ?? 0) * away };
  };
  /** Where it would be drawn as it is, from where it's drawn coming in or going out */
  const unpresent = (r: Rect, f: Flight | null, moved: boolean): Rect => {
    const s = scaleOf(f);
    const box = s === 1 ? r : { x: r.x + (r.w - r.w / s) / 2, y: r.y + (r.h - r.h / s) / 2, w: r.w / s, h: r.h / s };
    if (!moved) return box;
    const off = offsetOf(f);
    return { ...box, x: box.x - off.x, y: box.y - off.y };
  };

  /** Writes a flight's values on its element */
  const paint = (el: HTMLElement, f: Flight) => {
    const v = f.values;
    const look = lookOf(f);
    const away = awayOf(f);
    const scale = scaleOf(f);
    if (f.moves && !el.hasAttribute(DRAGGING)) {
      const { x, y, z } = f.base;
      const off = offsetOf(f);
      const by = (own: string, d: number) => (own === "0px" ? px(d) : `calc(${own} + ${px(d)})`);
      el.style.translate = `${by(x, v.x + off.x)} ${by(y, v.y + off.y)}${z ? ` ${z}` : ""}`;
    }
    if (look) {
      const round = (n: number) => Math.round(n * scale * 10000) / 10000;
      el.style.scale = `${round(f.base.sx)} ${round(f.base.sy)}`;
      const opacity = look.opacity ?? 1;
      el.style.opacity = String(Math.round(f.opacity * (1 - (1 - opacity) * away) * 1000) / 1000);
      if (look.blur) {
        const blur = look.blur * away;
        const own = f.base.filter;
        el.style.filter = blur > 0.01 ? `${own ? `${own} ` : ""}blur(${px(blur)})` : own || "none";
        // Safari doesn't draw a blur that changes under glass unless it's on a layer of its own
        el.style.willChange = "filter";
      }
    }
    if (f.pin.w) el.style.width = px(v.w);
    if (f.pin.h) el.style.height = px(v.h);
    // Read once the frame is painted, when the layout is already worked out and costs nothing
    reading ||= win.setTimeout(drawnNow, 0);
  };

  /** Where everything was drawn in the frame just painted */
  const drawnNow = () => {
    reading = 0;
    if (destroyed || !moving) return;
    const origin = root.getBoundingClientRect();
    rootDrawn = { x: 0, y: 0, w: origin.width, h: origin.height };
    for (const item of tracked.values()) {
      if (!item.el.isConnected) continue;
      const r = relative(item.el.getBoundingClientRect(), origin);
      // Coming in or going out it's drawn smaller and moved: its box is the one it's drawn from
      item.drawn = unpresent(r, item.flight, !item.el.hasAttribute(DRAGGING));
    }
  };

  /** Takes off what the layout writes for a moment: where it moves it to, or its sizes too */
  const bare = (el: HTMLElement, f: Flight, sizes: boolean) => {
    const own = f.own;
    for (const k of ["translate", "scale"]) {
      const [value, priority] = own.get(k)!;
      el.style.setProperty(k, value, priority);
    }
    if (!sizes) return;
    for (const k of ["width", "height"]) {
      const [value, priority] = own.get(k)!;
      el.style.setProperty(k, value, priority);
    }
  };

  /** Holds an element's size along the axes asked, as the layout writes it */
  const hold = (el: HTMLElement, f: Flight) => {
    const { w, h } = f.pin;
    if (!w && !h) return;
    // Its size is the layout's now: not watched until it's at rest, or writing it while a resize is
    // being told would be a resize the browser can't tell in that frame (an error on the page)
    resizes.unobserve(el);
    watched.delete(el);
    el.style.boxSizing = "border-box";
    // In a flex container its size along the main axis is the flex's unless it's held there too
    const parent = el.parentElement ? win.getComputedStyle(el.parentElement) : null;
    if (parent && /flex/.test(parent.display)) {
      const across = !parent.flexDirection.startsWith("column");
      if (across ? w : h) {
        el.style.flexGrow = "0";
        el.style.flexShrink = "0";
        el.style.flexBasis = "auto";
      }
    }
    if (w) {
      el.style.minWidth = "0";
      el.style.maxWidth = "none";
      el.style.overflowX = "clip";
    }
    if (h) {
      el.style.minHeight = "0";
      el.style.maxHeight = "none";
      el.style.overflowY = "clip";
    }
  };

  const flightOf = (el: HTMLElement, values: Values): Flight => {
    const style = win.getComputedStyle(el);
    const f: Flight = {
      spring: null!,
      values: { ...values },
      own: save(el),
      base: baseOf(style),
      opacity: parseFloat(style.opacity) || 1,
      pin: { w: false, h: false },
      presence: null,
      moves: el !== root,
    };
    f.spring = new SpringAnimator<Channel>(
      values,
      spring,
      (v) => {
        f.values = v;
        if (!destroyed) paint(el, f);
      },
      () => landed(el, f),
      PRECISION,
    );
    return f;
  };

  /** One element come to rest: everything of the layout's off it */
  const landed = (el: HTMLElement, f: Flight) => {
    f.spring.stop();
    if (f.presence === "exit") gone(el, f);
    else {
      putBack(el, f.own);
      rewatch(el);
      if (el === root) {
        rootFlight = null;
        rootDrawn = rootRect;
      } else {
        const item = tracked.get(el);
        if (item?.flight === f) {
          item.flight = null;
          item.drawn = item.rect;
        }
      }
    }
    settled();
  };

  const busy = () => !!rootFlight || leaving.size > 0 || [...tracked.values()].some((i) => i.flight);

  /** Everything at rest: the layout as it is now is read once more, for what changed on the way */
  const settled = () => {
    if (destroyed || busy()) return;
    moving = false;
    onRest?.();
    change();
  };

  const setOff = () => {
    if (moving) return;
    moving = true;
    onStart?.();
  };

  /** Starts an item, or the root, on its way, or sends it on from where it is */
  const fly = (el: HTMLElement, from: Values, to: Values, flight: Flight | null): Flight => {
    if (flight) {
      flight.spring.jump(from);
      // Drawn from there now, not a frame later when the spring next moves
      flight.values = { ...flight.values, ...from };
      flight.spring.to(to, spring);
      return flight;
    }
    const f = flightOf(el, from);
    f.spring.to(to);
    return f;
  };

  /** Reads the layout, and sets off whatever it moved */
  const change = () => {
    if (destroyed) return;
    const now = list();
    // Not drawn now, or not when last read: nothing would be seen moving, or it would come from nowhere
    const drawn = rendered();
    const instant = reduced.matches || !drawn || unseen;
    unseen = !drawn;
    // Where a flight sets off from: where each was last drawn
    const shown = new Map<HTMLElement, Rect>();
    for (const item of tracked.values()) shown.set(item.el, cameBack.get(item.el)?.rect ?? item.drawn);
    const rootShown = rootDrawn;

    // Where the page puts everything, nothing of the layout's on it
    for (const item of tracked.values()) if (item.flight) bare(item.el, item.flight, true);
    if (rootFlight) bare(root, rootFlight, true);
    const origin = root.getBoundingClientRect();
    const natural = new Map(now.map((el) => [el, relative(el.getBoundingClientRect(), origin)]));
    const rootNatural: Rect = { x: 0, y: 0, w: origin.width, h: origin.height };

    const gone = [...tracked.keys()].filter((el) => !natural.has(el));
    const moved =
      gone.length > 0 ||
      differs(rootNatural, rootRect) ||
      now.some((el) => {
        const item = tracked.get(el);
        return !item || differs(item.rect, natural.get(el)!);
      });

    if (!moved) {
      // Nothing new: back as it was drawn
      if (rootFlight) paint(root, rootFlight);
      for (const item of tracked.values()) if (item.flight) paint(item.el, item.flight);
      return;
    }

    if (instant) {
      for (const item of tracked.values()) if (item.flight) landedAt(item.el, item.flight);
      if (rootFlight) landedAt(root, rootFlight);
      for (const el of leaving.keys()) landedAt(el, leaving.get(el)!.flight!);
      tracked.clear();
      for (const el of now) tracked.set(el, { el, rect: natural.get(el)!, drawn: natural.get(el)!, flight: null });
      rootRect = rootDrawn = rootNatural;
      watch();
      if (moving) {
        moving = false;
        onRest?.();
      }
      return;
    }

    // Sizes that change are held where they're drawn, and change from there
    const pins = new Map<HTMLElement, { w: boolean; h: boolean }>();
    for (const el of now) {
      const item = tracked.get(el);
      const was = item && shown.get(el);
      if (!size || !item || !was) continue;
      const to = natural.get(el)!;
      const pin = {
        w: Math.abs(was.w - to.w) > EPSILON || !!item.flight?.pin.w,
        h: Math.abs(was.h - to.h) > EPSILON || !!item.flight?.pin.h,
      };
      if (!pin.w && !pin.h) continue;
      pins.set(el, pin);
      // Its own styles saved before any of the layout's are written
      item.flight ??= flightOf(el, { x: 0, y: 0, w: was.w, h: was.h, p: 1 });
      item.flight.pin = pin;
      if (pin.w) el.style.width = px(was.w);
      if (pin.h) el.style.height = px(was.h);
      hold(el, item.flight);
    }
    const rootPin = size
      ? {
          w: Math.abs(rootShown.w - rootNatural.w) > EPSILON || !!rootFlight?.pin.w,
          h: Math.abs(rootShown.h - rootNatural.h) > EPSILON || !!rootFlight?.pin.h,
        }
      : { w: false, h: false };
    if (rootPin.w || rootPin.h) {
      rootFlight ??= flightOf(root, { x: 0, y: 0, w: rootShown.w, h: rootShown.h, p: 1 });
      rootFlight.pin = rootPin;
      if (rootPin.w) root.style.width = px(rootShown.w);
      if (rootPin.h) root.style.height = px(rootShown.h);
      hold(root, rootFlight);
    }

    // Where the page puts them with those sizes held: each is shown where it was, and moves from there
    const origin2 = root.getBoundingClientRect();
    for (const el of now) {
      const at = relative(el.getBoundingClientRect(), origin2);
      const item = tracked.get(el);
      const to = natural.get(el)!;
      const was = item ? shown.get(el) : undefined;
      if (!item) {
        const fresh: Item = { el, rect: to, drawn: to, flight: null };
        tracked.set(el, fresh);
        if (enter) {
          fresh.flight = flightOf(el, { x: 0, y: 0, w: to.w, h: to.h, p: 0 });
          fresh.flight.presence = "enter";
          fresh.flight.spring.to({ x: 0, y: 0, w: to.w, h: to.h, p: 1 });
          setOff();
        }
        continue;
      }
      item.rect = to;
      if (!was || el.hasAttribute(DRAGGING)) {
        if (item.flight && !item.flight.presence) landedAt(el, item.flight);
        continue;
      }
      const dx = was.x - at.x;
      const dy = was.y - at.y;
      const pin = pins.get(el);
      if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON && !pin && !item.flight) continue;
      const back = cameBack.get(el);
      const p = back?.p ?? item.flight?.values.p ?? 1;
      const from = { x: dx, y: dy, w: was.w, h: was.h, p };
      const goal = { x: 0, y: 0, w: to.w, h: to.h, p: 1 };
      item.flight = fly(el, from, goal, item.flight);
      // On its way back in from where it was going out
      if (back && p < 1) item.flight.presence = "enter";
      setOff();
    }
    if (rootFlight) {
      rootFlight.spring.to({ x: 0, y: 0, w: rootNatural.w, h: rootNatural.h, p: 1 }, spring);
      setOff();
    }

    cameBack.clear();

    // Taken out of the page: back in its place for the while, going out where it was. One still in
    // the page (hidden, or no longer an item) just stops being one
    for (const el of gone) {
      const item = tracked.get(el)!;
      tracked.delete(el);
      if (exit && !el.isConnected) leave(item, item.drawn, origin2);
      else if (item.flight) landedAt(el, item.flight);
    }

    rootRect = rootNatural;
    // Drawn where they set off from, or where they are if they don't move
    if (!rootFlight) rootDrawn = rootNatural;
    for (const item of tracked.values()) item.drawn = item.flight ? (shown.get(item.el) ?? item.rect) : item.rect;
    // Everything drawn as it sets off, before a frame is painted
    if (rootFlight) paint(root, rootFlight);
    for (const item of [...tracked.values(), ...leaving.values()]) if (item.flight) paint(item.el, item.flight);
    watch();
  };

  /** Nothing of going out left on it: as the page had it, should the page put it back */
  const unmark = (el: HTMLElement, f: Flight) => {
    putBack(el, f.own);
    el.removeAttribute(PART);
    const { hidden = null, inert = false } = f.marks ?? {};
    if (hidden === null) el.removeAttribute("aria-hidden");
    else el.setAttribute("aria-hidden", hidden);
    el.inert = inert;
  };

  /** Gone out: taken out of the page again, as the page had it */
  const gone = (el: HTMLElement, f: Flight) => {
    leaving.delete(el);
    removedFrom.delete(el);
    unmark(el, f);
    if (el.isConnected) {
      ours.add(el);
      el.remove();
    }
  };

  /** A node the page put back while it was going out: an item again, moving from where it was drawn */
  const comeBack = (el: HTMLElement) => {
    const item = leaving.get(el)!;
    const f = item.flight!;
    leaving.delete(el);
    const r = relative(el.getBoundingClientRect(), root.getBoundingClientRect());
    cameBack.set(el, { rect: unpresent(r, f, true), p: f.values.p });
    f.spring.stop();
    unmark(el, f);
    item.flight = null;
    tracked.set(el, item);
  };

  const leave = (item: Item, was: Rect, origin: DOMRect) => {
    const el = item.el;
    const place = removedFrom.get(el);
    if (!el.isConnected) {
      const parent = place?.parent;
      if (!parent || !parent.isConnected) {
        if (item.flight) item.flight.spring.stop();
        return;
      }
      const next = place.next && place.next.parentNode === parent ? place.next : null;
      ours.add(el);
      parent.insertBefore(el, next);
    }
    const p = item.flight?.values.p ?? 1;
    const f = item.flight ?? flightOf(el, { x: 0, y: 0, w: was.w, h: was.h, p });
    if (item.flight) {
      // What it was on its way to is nothing now
      bare(el, f, true);
      f.pin = { w: false, h: false };
    }
    f.presence = "exit";
    f.marks = { hidden: el.getAttribute("aria-hidden"), inert: el.inert };
    el.setAttribute(PART, "");
    el.setAttribute("aria-hidden", "true");
    el.inert = true;
    el.style.pointerEvents = "none";
    el.style.position = "absolute";
    el.style.margin = "0";
    el.style.boxSizing = "border-box";
    el.style.width = px(was.w);
    el.style.height = px(was.h);
    el.style.left = "0px";
    el.style.top = "0px";
    bare(el, f, false);
    // Where it lands out of the flow, whatever it's positioned in: moved by that much to where it was
    const r = relative(el.getBoundingClientRect(), origin);
    el.style.left = px(was.x - r.x);
    el.style.top = px(was.y - r.y);
    item.flight = f;
    leaving.set(el, item);
    f.spring.jump({ x: 0, y: 0 });
    f.values = { ...f.values, x: 0, y: 0 };
    f.spring.to({ x: 0, y: 0, w: was.w, h: was.h, p: 0 }, spring);
    setOff();
  };

  /** Put where it's going at once */
  const landedAt = (el: HTMLElement, f: Flight) => {
    f.spring.stop();
    if (f.presence === "exit") return gone(el, f);
    putBack(el, f.own);
    rewatch(el);
    if (el === root) rootFlight = null;
    const item = tracked.get(el);
    if (item?.flight === f) item.flight = null;
  };

  // What changes it: items put in or taken out, their classes, their sizes
  const mutations = new MutationObserver((records) => {
    let any = false;
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.removedNodes) {
          if (ours.delete(node)) continue;
          removedFrom.set(node, { parent: record.target, next: record.nextSibling });
          any = true;
        }
        for (const node of record.addedNodes) {
          if (ours.delete(node)) continue;
          if (leaving.has(node as HTMLElement)) comeBack(node as HTMLElement);
          any = true;
        }
      } else if (
        record.target === root ||
        tracked.has(record.target as HTMLElement) ||
        (selector && [...tracked.keys()].some((el) => record.target.contains(el)))
      ) {
        any = true;
      }
    }
    if (any) change();
  });
  const resizes = new ResizeObserver((entries) => {
    // On its way, a size is the layout's: what changed meanwhile is read once it's at rest, unless
    // the root is hidden on the way, and it all lands at once
    if (moving && rendered()) return;
    if (entries.some((e) => e.target === root || tracked.has(e.target as HTMLElement))) change();
  });
  const watched = new Set<Element>();
  /** Watched again once its size isn't held */
  const rewatch = (el: HTMLElement) => {
    if (destroyed || watched.has(el) || (el !== root && !tracked.has(el))) return;
    resizes.observe(el);
    watched.add(el);
  };
  const held = (el: Element) => {
    const f = el === root ? rootFlight : tracked.get(el as HTMLElement)?.flight;
    return !!f && (f.pin.w || f.pin.h);
  };
  /** Watches the sizes of the root and its items as they are now */
  const watch = () => {
    for (const el of watched) {
      if (el !== root && !tracked.has(el as HTMLElement)) {
        resizes.unobserve(el);
        watched.delete(el);
      }
    }
    for (const el of [root, ...tracked.keys()]) {
      if (watched.has(el) || held(el)) continue;
      resizes.observe(el);
      // Without a selector, the items' own classes: the root's subtree beyond them isn't watched
      if (el !== root && !selector) mutations.observe(el, { attributes: true, attributeFilter: ["class", "hidden"] });
      watched.add(el);
    }
  };

  // The layout as it is when made: nothing comes in
  const origin = root.getBoundingClientRect();
  rootRect = { x: 0, y: 0, w: origin.width, h: origin.height };
  rootDrawn = rootRect;
  for (const el of list()) {
    const rect = relative(el.getBoundingClientRect(), origin);
    tracked.set(el, { el, rect, drawn: rect, flight: null });
  }
  mutations.observe(root, {
    childList: true,
    subtree: !!selector,
    attributes: true,
    attributeFilter: ["class", "hidden"],
  });
  watch();

  return {
    get moving() {
      return moving;
    },
    update: () => change(),
    set(settings) {
      if ("spring" in settings) spring = settings.spring ?? defaultLayoutSpring;
      if ("size" in settings) size = settings.size ?? true;
      if ("enter" in settings) enter = settings.enter ?? transitions.scale();
      if ("exit" in settings) exit = settings.exit ?? transitions.scale();
      if ("onStart" in settings) onStart = settings.onStart;
      if ("onRest" in settings) onRest = settings.onRest;
    },
    destroy() {
      if (destroyed) return;
      mutations.disconnect();
      resizes.disconnect();
      win.clearTimeout(reading);
      for (const item of tracked.values()) if (item.flight) landedAt(item.el, item.flight);
      for (const [el, item] of leaving) if (item.flight) landedAt(el, item.flight);
      if (rootFlight) landedAt(root, rootFlight);
      destroyed = true;
      tracked.clear();
      removedFrom.clear();
    },
  };
}

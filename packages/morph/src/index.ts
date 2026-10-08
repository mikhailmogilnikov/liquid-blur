import { AWAY, PART, SURFACE, SpringAnimator, type SpringParams } from "@liquid-web/core";

/**
 * Morph: a control swells into a panel of the same glass and shrinks back. One piece of glass the
 * whole way: it grows from the control's box to the panel's, each corner going from the control's
 * real radius to the panel's (a capsule's `9999px` counts as half its height, as drawn; a percent
 * as the box makes it): always circular corners, never an oval, and a panel rounded on top only
 * stays square below. Where the browser draws `corner-shape`, the corners' shape goes from the
 * control's to the panel's too (a round button into a squircle panel, say), as a superellipse
 * along with the radius. Center, width and height move on springs of their own that set off from
 * a standstill, overshoot at most once and settle without swinging again: lively, never jelly.
 * Corners, icon and content follow a progress of their own that doesn't overshoot. The control's
 * icon fades out as it swells and back in as it shrinks; the panel's content comes in magnified
 * and out of focus and settles sharp.
 *
 * The control (`source`) stays where it is, unseen (`opacity: 0`, marked `data-lw-away`) while the
 * morph is anywhere but closed and at rest: still in the accessibility tree and focusable, so its
 * `aria-expanded` is read and focus on it isn't lost. Its stand-in, the shape that morphs, is a
 * copy of it (icon and all, without press behaviors: the control's transform and scale belong to
 * those) placed next to it in the same parent, only while it's away: closed and at rest the parent
 * has its own children and no others, so `:last-child` and the like hold, and a framework
 * rendering them finds no strangers. Only the copy's translate, size and radius change: a
 * contained box with an icon in it, so its layout costs next to nothing. While it shrinks back a
 * click on it goes to the control, so the panel can be opened again before it's all the way home.
 *
 * A `container` takes the copy instead, out of a parent that would clip it (`overflow: hidden`).
 * It's placed from where it sits like anywhere else; what it inherits (theme, custom properties)
 * is the container's, and selectors through the control's parent don't reach it there.
 *
 * In a glass group (a parent a group runs on, marked `data-lw-surface`: see @liquid-web/core) the
 * group leaves the away control out, and how the copy goes depends on where the panel opens:
 *   - beside the control's neighbors (and no container): the copy stays in the group and melts
 *     with them on the way, as anything there does
 *   - over any of them, or into a container: the group's glass is one surface behind all its
 *     children, so they'd show through a panel in it. The copy is lifted out instead, right after
 *     the group (or into the container), as glass of its own above it (`z-index: 1`), blurring
 *     what it covers. A second copy stays in the group where the control was, melted with its
 *     neighbors, and shrinks away under the lifted one (closing, grows back under it), so the neck
 *     to the neighbors comes and goes with the flight, not all at once.
 * The panel's content stacks above the lifted copy: give it `z-index: 2` or more.
 *
 * The panel's `content` is laid out once where and as big as the open panel, and moves only
 * through transform, opacity, filter and clip-path, so its text never reflows. It's a sibling of
 * the glass, never its ancestor: a filter, opacity or clip on an ancestor of a backdrop-filter cuts
 * the glass off from what's behind it. Its computed border-radius is the panel's; its inline
 * transform, opacity, filter and clip-path belong to the morph while it moves. A translation of its
 * own (`translate: -50% -50%`, or the same as `transform`) is kept: the morph's goes on top of it.
 * Open, the glass follows the panel's box: when the content's size or the window changes, or on
 * `update()` for anything else that moves it.
 *
 * Where `corner-shape` isn't drawn, corners stay round arcs and the morph leaves it alone. The
 * content's clip stays a round arc either way (`clip-path` has no corner shapes): inside a squircle
 * of the same radius, so nothing shows past the glass. In a glass group the melted outline is drawn
 * from round arcs, so while the copy melts with its neighbors its corners are round.
 *
 * Boxes are read on open and close, and again on `update()`, on screen; each piece is placed from
 * where it sits untransformed. A rotated or scaled ancestor isn't supported. With reduced motion,
 * or asked to be instant, the panel and the control swap at once.
 */

/** The shape's center, its size, and a progress for corners, icon and content */
type Channel = "cx" | "cy" | "w" | "h" | "p";

/**
 * Springs for the center's travel (`x`, `y`), the size (`width`, `height`), and the progress that
 * corners, icon and content follow. A spring's `bounce` is how far it overshoots, its `settle` how
 * it comes back after: low, and it overshoots once and no more.
 */
export type MorphSprings = {
  x: SpringParams;
  y: SpringParams;
  width: SpringParams;
  height: SpringParams;
  progress: SpringParams;
};

/** Where a morph is: on its way somewhere, or at rest there */
export type MorphPhase = "closed" | "opening" | "open" | "closing";

export type MorphOptions = {
  /** The control it opens from */
  source: HTMLElement;
  /** The panel's content, laid out where the panel opens */
  content: HTMLElement;
  /** Where the glass goes instead of next to the control: out of a parent that would clip it */
  container?: HTMLElement;
  /** Springs one way and the other; any left out are the defaults' */
  spring?: { open?: Partial<MorphSprings>; close?: Partial<MorphSprings> };
  /** Starts open, at rest, without a morph and without `onStart` or `onRest` */
  initialOpen?: boolean;
  /**
   * Closes on Escape and on a press outside the panel and the control, while open. `true` for
   * both; off unless given.
   */
  dismiss?: boolean | { escape?: boolean; outside?: boolean };
  /** Called when a morph sets off, opening or closing, turning around included */
  onStart?: (open: boolean) => void;
  /** Called when a morph comes to rest, open or closed */
  onRest?: (open: boolean) => void;
};

/** `instant`: the panel and the control swap at once, as with reduced motion */
export type MorphMove = { instant?: boolean };

export type Morph = {
  /** The state asked for, at once; `phase` says whether it's there yet */
  readonly isOpen: boolean;
  readonly phase: MorphPhase;
  /**
   * Each resolves when the morph comes to rest: `true` there, `false` if it turned around or was
   * destroyed first. Asked for where it already is (or is going), the same answer.
   */
  open(move?: MorphMove): Promise<boolean>;
  close(move?: MorphMove): Promise<boolean>;
  toggle(move?: MorphMove): Promise<boolean>;
  /** Reads the boxes again and follows them: for a panel or control moved by something unseen */
  update(): void;
  destroy(): void;
};

/** Corner radii, clockwise from the top left */
type Radii = [number, number, number, number];
/**
 * A box on screen, its corners' radii, and their shape as a superellipse exponent (the top left
 * one's: a panel with corners of different shapes is rare enough)
 */
type Box = { x: number; y: number; width: number; height: number; radii: Radii; shape: number };
type Frame = Record<Channel, number>;

/**
 * The springs a morph runs on unless given others. Opening, the control heads for the panel's
 * center first, runs past it once (further vertically) and settles back into place, while it
 * swells evenly all around, slower, catching up as it arrives. Closing, the shape holds a beat while
 * the content blurs away, then goes, the width first, the height after, and settles onto the
 * control without going past it.
 */
export const defaultMorphSprings: { open: MorphSprings; close: MorphSprings } = {
  open: {
    // Bouncy out (7% past, 17% vertically), then back without a second swing
    x: { duration: 0.19, bounce: 0.35, settle: 0.15 },
    y: { duration: 0.25, bounce: 0.53, settle: 0.15 },
    width: { duration: 0.34, bounce: 0.12 },
    height: { duration: 0.34, bounce: 0.12 },
    progress: { duration: 0.3, bounce: 0.1 },
  },
  close: {
    x: { duration: 0.26, bounce: 0.1 },
    y: { duration: 0.3, bounce: 0.1 },
    width: { duration: 0.24, bounce: 0.1 },
    height: { duration: 0.28, bounce: 0.1 },
    progress: { duration: 0.22, bounce: 0.1 },
  },
};
/** Where it's done: a quarter of a pixel, and a progress whose last bit moves nothing visible */
const PRECISION = { cx: 0.25, cy: 0.25, w: 0.25, h: 0.25, p: 0.002 };
/** Share of the progress over which the control's icon fades */
const ICON_SPAN = 0.3;
/** Closing from rest, the shape holds this share of its width's duration before it goes */
const CLOSE_HOLD = 0.12;
/** Lifted over a group: share of the progress over which the stub left in it shrinks away */
const STUB_SPAN = 0.35;
/** Content scale at the start: it comes in magnified */
const CONTENT_SCALE = 1.45;
/**
 * Where in the progress the content starts coming in (early, while the shape is still small) and
 * over how much of it it focuses and settles to scale: nearly the whole opening. It's fully opaque
 * about two thirds of the way.
 */
const CONTENT_FROM = 0.08;
const CONTENT_SPAN = 0.87;
/** Content blur at the start, px; below a third of a pixel it's dropped */
const CONTENT_BLUR = 14;
/**
 * Press behaviors stay with the control: the copy only looks like it. Press behaviors skip a
 * `data-lw-part` already; their classes come off too, so their CSS without the script (`:active`)
 * doesn't scale the copy either. Names only: nothing of theirs is loaded.
 */
const BEHAVIORS = ["lb-highlight", "lb-swell", "lb-stretch", "lb-interactive"];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * `corner-shape` as a superellipse exponent: round 1, squircle 2, bevel 0, scoop -1. Square and
 * notch are infinite in CSS; a large exponent draws them all but exactly and still interpolates.
 */
const CORNER_SHAPES: Record<string, number> = { round: 1, squircle: 2, bevel: 0, scoop: -1, square: 8, notch: -8 };
const shapeOf = (value: string) => {
  const v = value.trim().toLowerCase();
  if (v in CORNER_SHAPES) return CORNER_SHAPES[v];
  const arg = /^superellipse\(\s*([^)]*?)\s*\)$/.exec(v)?.[1];
  if (arg === "infinity") return 8;
  if (arg === "-infinity") return -8;
  const k = arg === undefined ? NaN : parseFloat(arg);
  return Number.isFinite(k) ? Math.min(8, Math.max(-8, k)) : 1;
};
/** To a hundredth of a pixel, so float noise doesn't reach the style */
const px = (v: number) => `${Math.round(v * 100) / 100}px`;
/** The translation in a computed `transform` (a matrix, or `none`) */
const shiftOf = (transform: string) => {
  const m = /^matrix(3d)?\((.*)\)$/.exec(transform);
  if (!m) return { x: 0, y: 0 };
  const v = m[2].split(",").map(parseFloat);
  const [x, y] = m[1] ? [v[12], v[13]] : [v[4], v[5]];
  return { x: x || 0, y: y || 0 };
};

/**
 * A computed corner radius (`10px`, `10%`, `10px 20px`) as one circular radius: a percent of the
 * box's width across and its height down, the smaller of the two, so a corner is never an oval
 */
const cornerOf = (value: string, width: number, height: number) => {
  const [across, down = across] = value.trim().split(/\s+/);
  const resolve = (v: string | undefined, side: number) =>
    !v ? 0 : v.endsWith("%") ? (parseFloat(v) / 100) * side : parseFloat(v) || 0;
  return Math.max(0, Math.min(resolve(across, width), resolve(down, height)));
};
/**
 * Radii as the browser draws them in a box: where two corners on a side ask for more than the side
 * has, all of them shrink by the same factor (so a capsule's `9999px` is half its height)
 */
const fit = (r: Radii, width: number, height: number): Radii => {
  const room = (side: number, a: number, b: number) => (a + b > 0 ? side / (a + b) : Infinity);
  const f = Math.min(
    1,
    room(width, r[0], r[1]),
    room(width, r[3], r[2]),
    room(height, r[0], r[3]),
    room(height, r[1], r[2]),
  );
  return f < 1 ? (r.map((v) => v * f) as Radii) : r;
};
/** Radii as CSS, one value when they're all the same */
const radiiCss = (r: Radii, scale = 1) =>
  r.every((v) => v === r[0]) ? px(r[0] / scale) : r.map((v) => px(v / scale)).join(" ");

export function createMorph({
  source,
  content,
  container,
  spring: given,
  initialOpen = false,
  dismiss = false,
  onStart,
  onRest,
}: MorphOptions): Morph {
  const spring = {
    open: { ...defaultMorphSprings.open, ...given?.open },
    close: { ...defaultMorphSprings.close, ...given?.close },
  };
  const parent = source.parentElement;
  if (!parent) throw new Error("morph: the source needs a parent");
  const doc = parent.ownerDocument;
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  /** Whether corners can have shapes here; if not, they're round and `corner-shape` is left alone */
  const cornerShapes = win.CSS?.supports?.("corner-shape", "squircle") ?? false;
  const channels = (set: MorphSprings): Record<Channel, SpringParams> => ({
    cx: set.x,
    cy: set.y,
    w: set.width,
    h: set.height,
    p: set.progress,
  });

  /** A copy of the control, pinned out of the flow at its parent's corner, moved by transform */
  const copy = () => {
    const el = source.cloneNode(false) as HTMLElement;
    el.removeAttribute("id");
    el.removeAttribute(AWAY);
    el.setAttribute(PART, "");
    el.style.cssText =
      "position: absolute; left: 0; top: 0; margin: 0; box-sizing: border-box; contain: strict; " +
      "overflow: hidden; pointer-events: none";
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    return el;
  };
  /** The one that morphs */
  const shape = copy();
  /** Lifted over a group: the one that stays in it, where the control was */
  const stub = copy();
  stub.inert = true;
  // While it shrinks back it covers the control: a press on it is a press on the control
  const forward = (e: MouseEvent) => {
    e.stopPropagation();
    source.click();
  };
  shape.addEventListener("click", forward);
  let icon: (HTMLElement | SVGElement)[] = [];
  /** Where a child of the control sits on screen; loose text through a range */
  const spotOf = (node: ChildNode): DOMRect | null => {
    if (node instanceof Element) return node.getBoundingClientRect();
    if (node.nodeType !== 3 || !node.textContent?.trim()) return null;
    const range = doc.createRange();
    range.selectNodeContents(node);
    return typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
  };
  /**
   * Dresses a copy as the control is now (its label or icon may have changed since), with each
   * piece pinned where it sits in the control at rest: however the copy grows, its icon stays on
   * the control's spot (the copy clips it) instead of riding the middle of the shape.
   */
  const dress = (el: HTMLElement) => {
    el.className = source.className;
    el.classList.remove(...BEHAVIORS);
    const { transform, scale, translate, rotate } = source.style;
    source.style.transform = source.style.scale = source.style.translate = source.style.rotate = "none";
    const box = source.getBoundingClientRect();
    const spots = [...source.childNodes].map(spotOf);
    Object.assign(source.style, { transform, scale, translate, rotate });
    const pieces: (HTMLElement | SVGElement)[] = [];
    const twin = source.cloneNode(true) as HTMLElement;
    [...twin.childNodes].forEach((node, i) => {
      const spot = spots[i];
      if (!spot) return;
      let piece: HTMLElement | SVGElement;
      if (node.nodeType === 3) {
        /*
         * Loose text gets a box to carry its place and opacity. Its spot is the text's own box,
         * shorter than a line: a line as tall as that keeps the glyphs where they were, not
         * lowered by the half-leading of the inherited line-height.
         */
        piece = doc.createElement("span");
        piece.style.whiteSpace = "nowrap";
        piece.style.lineHeight = `${spot.height}px`;
        piece.append(node);
      } else {
        piece = node as HTMLElement | SVGElement;
        piece.style.width = `${spot.width}px`;
        piece.style.height = `${spot.height}px`;
      }
      piece.style.position = "absolute";
      piece.style.margin = "0";
      piece.style.left = `${spot.left - box.left - source.clientLeft}px`;
      piece.style.top = `${spot.top - box.top - source.clientTop}px`;
      pieces.push(piece);
    });
    el.replaceChildren(...pieces);
    return pieces;
  };

  const savedContent = content.style.cssText;
  content.style.visibility = "hidden";

  let isOpen = false;
  let from: Box = { x: 0, y: 0, width: 0, height: 0, radii: [0, 0, 0, 0], shape: 1 };
  let to: Box = from;

  /** An element's box on screen, with its corners' radii and the top-left one's shape */
  const measure = (el: HTMLElement): Box => {
    const r = el.getBoundingClientRect();
    const style = win.getComputedStyle(el);
    const corner = (value: string) => cornerOf(value, r.width, r.height);
    // The longhand where it's computed; else the shorthand's first corner
    const shape =
      style.getPropertyValue("corner-top-left-shape") ||
      (style
        .getPropertyValue("corner-shape")
        .trim()
        .match(/^\S+\([^)]*\)|^\S+/)?.[0] ??
        "");
    return {
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
      radii: fit(
        [
          corner(style.borderTopLeftRadius),
          corner(style.borderTopRightRadius),
          corner(style.borderBottomRightRadius),
          corner(style.borderBottomLeftRadius),
        ],
        r.width,
        r.height,
      ),
      shape: cornerShapes ? shapeOf(shape || "round") : 1,
    };
  };
  /**
   * The box an element has at rest: its inline transforms off for the measurement. A control just
   * pressed is still swollen (`lb-swell` writes `scale`) or pulled (`lb-stretch`, `transform`);
   * measured as is, the panel would close into a box bigger than the control and off its corners.
   * Put back in the same task, so nothing in between is ever painted.
   */
  const atRest = (el: HTMLElement): Box => {
    const { transform, scale, translate, rotate } = el.style;
    el.style.transform = el.style.scale = el.style.translate = el.style.rotate = "none";
    const box = measure(el);
    Object.assign(el.style, { transform, scale, translate, rotate });
    return box;
  };
  /**
   * The content's own transform from its stylesheet, if any, which the morph's goes on top of, and
   * the translation in it. Its inline one is the morph's: off for the measurement, so the box is
   * where it is at rest, its own translation and `translate` in it.
   */
  let base = "";
  let shift = { x: 0, y: 0 };
  const panelAtRest = (): Box => {
    const own = content.style.transform;
    content.style.transform = "";
    const box = measure(content);
    const transform = win.getComputedStyle(content).transform;
    content.style.transform = own;
    base = transform && transform !== "none" ? ` ${transform}` : "";
    shift = shiftOf(transform);
    return box;
  };
  const remeasure = () => {
    to = panelAtRest();
    /*
     * The control too, away or not: unseen, it keeps its box, and boxes are on screen, so the page
     * scrolled while the panel was open moves where it has to come back to
     */
    from = atRest(source);
  };

  /** The control unseen, and marked so a group leaves it out; its own inline opacity kept */
  let savedOpacity = "";
  const away = (on: boolean) => {
    if (on === source.hasAttribute(AWAY)) return;
    if (on) {
      savedOpacity = source.style.opacity;
      source.setAttribute(AWAY, "");
      source.style.opacity = "0";
    } else {
      source.removeAttribute(AWAY);
      source.style.opacity = savedOpacity;
    }
  };

  /** Whether the control's parent is one surface of glass now: a group runs on it */
  const grouped = () => parent.hasAttribute(SURFACE);
  /** Whether the panel would cover any of the control's neighbors in a group */
  const covers = (panel: Box) =>
    grouped() &&
    [...parent.children].some((el) => {
      if (el === source || !(el instanceof HTMLElement) || el.hasAttribute(PART) || el.hasAttribute(AWAY)) return false;
      if (win.getComputedStyle(el).visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.left < panel.x + panel.width &&
        r.right > panel.x &&
        r.top < panel.y + panel.height &&
        r.bottom > panel.y
      );
    });
  /** Out of the control's parent: over its group, or in the container */
  let lifted = false;
  /** Lifted out of a group: a stub stays in it */
  let stubbed = false;
  const lift = (on: boolean) => {
    lifted = on;
    stubbed = on && grouped();
    shape.style.zIndex = on ? "1" : "";
  };
  /** Puts `el` right after `anchor`, unless it's there already: moving it would restart its paint */
  const follow = (anchor: Element, el: Element) => {
    if (anchor.nextSibling !== el) anchor.after(el);
  };
  const place = () => {
    if (stubbed) follow(source, stub);
    else stub.remove();
    if (!lifted) follow(source, shape);
    else if (!container) follow(parent, shape);
    else if (container.lastChild !== shape) container.append(shape);
  };

  /** Where each copy's untransformed corner is on screen: its translate is measured from there */
  let shapeOrigin = { x: 0, y: 0 };
  let stubOrigin = { x: 0, y: 0 };
  const originOf = (el: HTMLElement) => {
    const { x, y } = atRest(el);
    return { x, y };
  };

  const render = (f: Frame) => {
    const w = Math.max(0, f.w);
    const h = Math.max(0, f.h);
    const x = f.cx - w / 2;
    const y = f.cy - h / 2;
    const t = clamp01(f.p);

    /*
     * Corners: each the control's real radius going to the panel's, the same on both axes: always
     * circular, never an oval. Driven by the progress alone, eased at both ends, so a size still
     * wobbling leaves them still. Never more than the box allows, as the browser would draw it.
     */
    const e = smooth(t);
    const radii = fit(from.radii.map((r, i) => mix(r, to.radii[i], e)) as Radii, w, h);
    shape.style.transform = `translate(${x - shapeOrigin.x}px, ${y - shapeOrigin.y}px)`;
    shape.style.width = `${w}px`;
    shape.style.height = `${h}px`;
    shape.style.borderRadius = radiiCss(radii);
    // The corners' shape along with their size, by the same progress
    if (from.shape !== 1 || to.shape !== 1) {
      const k = Math.round(mix(from.shape, to.shape, e) * 1000) / 1000;
      shape.style.setProperty("corner-shape", `superellipse(${k})`);
    } else shape.style.removeProperty("corner-shape");
    // The icon stays on the control's spot, fading as the shape leaves it
    const iconOpacity = String(1 - smooth(clamp01(t / ICON_SPAN)));
    for (const el of icon) {
      el.style.translate = `${from.x - x}px ${from.y - y}px`;
      el.style.opacity = iconOpacity;
    }
    if (stubbed) {
      // The stub shrinks away in the group, under the lifted copy
      const s = 1 - smooth(clamp01(t / STUB_SPAN));
      stub.style.transform = `translate(${from.x - stubOrigin.x}px, ${from.y - stubOrigin.y}px) scale(${s})`;
    }

    /*
     * Content: centered on the shape, magnified and blurred as it comes in, clipped to it. Its own
     * transform stays, under the morph's: scaled about the content's corner, its translation would
     * scale too, so the morph's translate takes back what the scale adds to it.
     */
    const c = 1 + (CONTENT_SCALE - 1) * (1 - smooth(clamp01((t - CONTENT_FROM) / CONTENT_SPAN)));
    const dx = x + w / 2 - to.x - (c * to.width) / 2;
    const dy = y + h / 2 - to.y - (c * to.height) / 2;
    content.style.transform = `translate(${dx + (1 - c) * shift.x}px, ${dy + (1 - c) * shift.y}px) scale(${c})` + base;
    // The shape's box in the content's own (untransformed) pixels
    const top = (y - to.y - dy) / c;
    const left = (x - to.x - dx) / c;
    const bottom = to.height - (y + h - to.y - dy) / c;
    const right = to.width - (x + w - to.x - dx) / c;
    content.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radiiCss(radii, c)})`;
    content.style.opacity = String(smooth(clamp01((t - CONTENT_FROM) / (CONTENT_SPAN * 0.65))));
    const blur = CONTENT_BLUR * (1 - smooth(clamp01((t - CONTENT_FROM) / CONTENT_SPAN)));
    content.style.filter = blur > 0.33 ? `blur(${blur}px)` : "";
  };

  /** Where each copy's untransformed corner is now: the page may have moved under them */
  const reorigin = () => {
    shapeOrigin = originOf(shape);
    if (stubbed) stubOrigin = originOf(stub);
  };

  const launch = () => {
    icon = dress(shape);
    if (stubbed) {
      dress(stub);
      stub.style.width = `${from.width}px`;
      stub.style.height = `${from.height}px`;
    }
    place();
    reorigin();
    shape.style.pointerEvents = isOpen ? "none" : "";
    away(true);
    // Explicitly: a panel kept hidden by its stylesheet until the script runs still shows
    content.style.visibility = "visible";
    content.style.transformOrigin = "0 0";
  };

  /** At rest open the content is itself again: nothing clipped, filtered or composited */
  const release = () => {
    content.style.transform = "";
    content.style.transformOrigin = "";
    content.style.clipPath = "";
    content.style.filter = "";
    content.style.opacity = "";
  };

  /** What `open()` or `close()` handed out for the way it's going now */
  let pending: { open: boolean; promise: Promise<boolean>; resolve: (done: boolean) => void } | null = null;
  const promise = (open: boolean) => {
    if (pending?.open === open) return pending.promise;
    pending?.resolve(false);
    let resolve: (done: boolean) => void = () => {};
    const p = new Promise<boolean>((r) => (resolve = r));
    pending = { open, promise: p, resolve };
    return p;
  };

  /** Quiet: arriving as it was created, with nothing to tell */
  const settle = (quiet = false) => {
    stub.remove();
    if (isOpen) release();
    else {
      // The control takes over from its copy, which sits exactly where it is; the copy leaves
      shape.remove();
      content.style.visibility = "hidden";
      away(false);
    }
    if (quiet) return;
    onRest?.(isOpen);
    const arrived = pending;
    pending = null;
    arrived?.resolve(true);
  };

  const at = (b: Box, p: number): Frame => ({
    cx: b.x + b.width / 2,
    cy: b.y + b.height / 2,
    w: b.width,
    h: b.height,
    p,
  });

  let motion: SpringAnimator<Channel> | null = null;
  const rest = () => {
    motion = null;
    content.style.pointerEvents = "";
    settle();
  };
  /** Morphs from `start` to `target`; one under way turns around, keeping its speed */
  const run = (start: Frame, target: Frame, set: MorphSprings, instant: boolean) => {
    if (instant || reduced.matches) {
      motion?.stop();
      motion = null;
      render(target);
      rest();
      return;
    }
    motion ??= new SpringAnimator(start, channels(set), render, rest, PRECISION);
    motion.to(target, channels(set));
  };

  /** Closing from rest: the beat the shape holds before it goes */
  let hold = 0;
  /** Whether that beat is still on: the shape heads for where it is, only the content goes */
  let holding = false;
  let destroyed = false;
  /** Where the morph is headed, from the boxes as they are now */
  const goal = () => (isOpen ? at(to, 1) : holding ? { ...at(to, 1), p: 0 } : at(from, 0));

  const open = ({ instant = false }: MorphMove = {}) => {
    if (destroyed) return Promise.resolve(false);
    if (isOpen) {
      if (instant && motion) run(at(from, 0), goal(), spring.open, true);
      return pending?.promise ?? Promise.resolve(true);
    }
    isOpen = true;
    const done = promise(true);
    win.clearTimeout(hold);
    holding = false;
    source.setAttribute("aria-expanded", "true");
    remeasure();
    // Where it goes is settled at rest only: mid-way it turns around where it is
    if (!motion) lift(!!container || covers(to));
    launch();
    onStart?.(true);
    run(at(from, 0), goal(), spring.open, instant);
    return done;
  };

  const close = ({ instant = false }: MorphMove = {}) => {
    if (destroyed) return Promise.resolve(false);
    if (!isOpen) {
      if (instant && motion) {
        win.clearTimeout(hold);
        holding = false;
        run(at(to, 1), goal(), spring.close, true);
      }
      return pending?.promise ?? Promise.resolve(true);
    }
    isOpen = false;
    const done = promise(false);
    source.setAttribute("aria-expanded", "false");
    remeasure();
    launch();
    content.style.pointerEvents = "none";
    onStart?.(false);
    if (motion || instant || reduced.matches) {
      run(at(to, 1), goal(), spring.close, instant);
      return done;
    }
    // From rest the content goes first: the shape holds a beat where it is, then follows
    holding = true;
    run(at(to, 1), goal(), spring.close, false);
    hold = win.setTimeout(
      () => {
        holding = false;
        if (!isOpen) motion?.to(goal(), channels(spring.close));
      },
      CLOSE_HOLD * spring.close.width.duration * 1000,
    );
    return done;
  };

  /**
   * The boxes read again, and the morph after them: under way it heads for the new ones as a
   * correction of the same flight, open and at rest the glass takes the panel's new box at once
   * (the content is already there).
   */
  const update = () => {
    if (destroyed || (!isOpen && !motion)) return;
    remeasure();
    reorigin();
    if (motion) motion.retarget(goal());
    else {
      render(at(to, 1));
      release();
    }
  };
  /** A change of the content's size, not its first report: that one is only where it starts */
  let size = "";
  const resized =
    typeof win.ResizeObserver === "function"
      ? new win.ResizeObserver(([entry]) => {
          const now = `${entry.contentRect.width} ${entry.contentRect.height}`;
          const first = !size;
          if (now === size) return;
          size = now;
          if (!first) update();
        })
      : null;
  resized?.observe(content);
  win.addEventListener("resize", update);

  // Dismissal, when asked for: Escape, and a press anywhere but the panel, the control and its copy
  const { escape = false, outside = false } =
    dismiss === true ? { escape: true, outside: true } : dismiss === false ? {} : dismiss;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen && !e.defaultPrevented) close();
  };
  const onPress = (e: PointerEvent) => {
    if (!isOpen) return;
    const target = e.target as Node | null;
    if (target && (content.contains(target) || source.contains(target) || shape.contains(target))) return;
    close();
  };
  if (escape) doc.addEventListener("keydown", onKey);
  // Capturing: a handler that stops the press on its way doesn't keep the panel open
  if (outside) doc.addEventListener("pointerdown", onPress, true);

  source.setAttribute("aria-expanded", "false");
  if (initialOpen) {
    // Open from the start: in place at once, as if it had always been
    isOpen = true;
    source.setAttribute("aria-expanded", "true");
    remeasure();
    lift(!!container || covers(to));
    launch();
    render(at(to, 1));
    content.style.pointerEvents = "";
    settle(true);
  }

  return {
    get isOpen() {
      return isOpen;
    },
    get phase(): MorphPhase {
      return motion ? (isOpen ? "opening" : "closing") : isOpen ? "open" : "closed";
    },
    open,
    close,
    toggle: (move?: MorphMove) => (isOpen ? close(move) : open(move)),
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      win.clearTimeout(hold);
      motion?.stop();
      motion = null;
      resized?.disconnect();
      win.removeEventListener("resize", update);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("pointerdown", onPress, true);
      shape.removeEventListener("click", forward);
      shape.remove();
      stub.remove();
      away(false);
      source.removeAttribute("aria-expanded");
      content.style.cssText = savedContent;
      const left = pending;
      pending = null;
      left?.resolve(false);
    },
  };
}

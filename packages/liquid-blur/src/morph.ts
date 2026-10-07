import { SpringAnimator, type SpringParams } from "./springAnimator";

/**
 * Morph: a control swells into a panel of the same glass and shrinks back. One piece of glass the
 * whole way: it grows from the control's box to the panel's, its corners going from the control's
 * real radius to the panel's (a capsule's `9999px` counts as half its height, as drawn): always a
 * rounded box, never an oval. Where the browser draws `corner-shape`, the corners' shape goes from
 * the control's to the panel's too (a round button into a squircle panel, say), as a superellipse
 * along with the radius. Center, width and height move on springs of their own that set off from
 * a standstill, overshoot at most once and settle without swinging again: lively, never jelly.
 * Corners, icon and content follow a progress of their own that doesn't overshoot. The control's icon fades out as it swells and back in as it shrinks; the panel's
 * content comes in magnified and out of focus and settles sharp.
 *
 * The control (`source`) stays where it is, hidden (`visibility: hidden`) while the morph is
 * anywhere but closed and at rest. Its stand-in, the shape that morphs, is a copy of it (icon and
 * all, without press behaviors: the control's transform and scale belong to those) placed next to
 * it in the same parent. Only the copy's translate, size and radius change: a contained box with
 * an icon in it, so its layout costs next to nothing. While it shrinks back a click on it goes to
 * the control, so the panel can be opened again before it's all the way home.
 *
 * In a glass group (`.lb-group`) the group leaves the hidden control out, and how the copy goes
 * depends on where the panel opens:
 *   - beside the control's neighbors: the copy stays in the group and melts with them on the way,
 *     as anything there does
 *   - over any of them: the group's glass is one surface behind all its children, so they'd show
 *     through a panel in it. The copy is lifted out instead, right after the group, as glass of its
 *     own above it, blurring what it covers. A second copy stays in the group where the control
 *     was, melted with its neighbors, and shrinks away under the lifted one (closing, grows back
 *     under it), so the neck to the neighbors comes and goes with the flight, not all at once.
 * The panel's content has to stack above the lifted copy (it gets `z-index: 1`).
 *
 * The panel's `content` is laid out once where and as big as the open panel, and moves only
 * through transform, opacity, filter and clip-path, so its text never reflows. It's a sibling of
 * the glass, never its ancestor: a filter, opacity or clip on an ancestor of a backdrop-filter cuts
 * the glass off from what's behind it. Its computed border-radius is the panel's; its inline
 * transform, opacity, filter and clip-path belong to the morph while it moves.
 *
 * Where `corner-shape` isn't drawn, corners stay round arcs and the morph leaves it alone. The
 * content's clip stays a round arc either way (`clip-path` has no corner shapes): inside a squircle
 * of the same radius, so nothing shows past the glass. In a glass group the melted outline is drawn
 * from round arcs, so while the copy melts with its neighbors its corners are round.
 *
 * Boxes are read once per open and close, on screen; each piece is placed from where it sits
 * untransformed. A rotated or scaled ancestor isn't supported. With reduced motion the panel and
 * the control swap at once.
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

export type MorphOptions = {
  /** The control it opens from */
  source: HTMLElement;
  /** The panel's content, laid out where the panel opens */
  content: HTMLElement;
  /** Springs one way and the other */
  spring?: { open: MorphSprings; close: MorphSprings };
  /** Called when a morph comes to rest, open or closed */
  onRest?: (open: boolean) => void;
};

export type Morph = {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
};

/** A box on screen, its corner radius, and its corners' shape as a superellipse exponent */
type Box = { x: number; y: number; width: number; height: number; radius: number; shape: number };
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
/** Press behaviors stay with the control: the copy only looks like it */
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

export function createMorph({ source, content, spring = defaultMorphSprings, onRest }: MorphOptions): Morph {
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
    el.style.cssText =
      "position: absolute; left: 0; top: 0; margin: 0; box-sizing: border-box; contain: strict; " +
      "overflow: hidden; pointer-events: none; display: none";
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    return el;
  };
  /** The one that morphs */
  const shape = copy();
  /** Lifted over a group: the one that stays in it, where the control was */
  const stub = copy();
  stub.inert = true;
  // While it shrinks back the control is hidden: a press on it is a press on the control
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
        // Loose text gets a box to carry its place and opacity
        piece = doc.createElement("span");
        piece.style.whiteSpace = "nowrap";
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
  icon = dress(shape);
  source.after(stub, shape);

  const savedContent = content.style.cssText;
  content.style.visibility = "hidden";
  content.style.transformOrigin = "0 0";

  let isOpen = false;
  let from: Box = { x: 0, y: 0, width: 0, height: 0, radius: 0, shape: 1 };
  let to: Box = from;

  /** An element's box on screen, with its top-left corner's radius and shape */
  const measure = (el: HTMLElement): Box => {
    const r = el.getBoundingClientRect();
    const style = win.getComputedStyle(el);
    const radius = parseFloat(style.borderTopLeftRadius) || 0;
    // The longhand where it's computed; else the shorthand's first corner
    const corner =
      style.getPropertyValue("corner-top-left-shape") ||
      (style.getPropertyValue("corner-shape").trim().match(/^\S+\([^)]*\)|^\S+/)?.[0] ?? "");
    return {
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
      radius: Math.min(radius, r.width / 2, r.height / 2),
      shape: cornerShapes ? shapeOf(corner || "round") : 1,
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
  const remeasure = () => {
    to = atRest(content);
    // Only while the control is in place: once away, the box it left is the one to come back to
    if (source.style.visibility !== "hidden") from = atRest(source);
  };

  /** Whether the panel would cover any of the control's neighbors in a group */
  const covers = (panel: Box) =>
    parent.classList.contains("lb-group") &&
    [...parent.children].some((el) => {
      if (el === source || el === shape || el === stub || !(el instanceof HTMLElement)) return false;
      if (el.classList.contains("lb-group__glass") || el.classList.contains("lb-group__paint")) return false;
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
  let lifted = false;
  /** Out of the group and over it, or in it next to the control */
  const lift = (on: boolean) => {
    lifted = on;
    if (on) parent.after(shape);
    else stub.after(shape);
    shape.style.zIndex = on ? "1" : "";
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
     * Corners: the control's real radius (a capsule's `9999px` as drawn, half its height) going to
     * the panel's, the same on both axes: always a rounded box, never an oval. Driven by the
     * progress alone, eased at both ends, so a size still wobbling leaves them still. Never more
     * than the box allows, as the browser would draw it.
     */
    const radius = Math.min(w / 2, h / 2, mix(from.radius, to.radius, smooth(t)));
    shape.style.transform = `translate(${x - shapeOrigin.x}px, ${y - shapeOrigin.y}px)`;
    shape.style.width = `${w}px`;
    shape.style.height = `${h}px`;
    shape.style.borderRadius = px(radius);
    // The corners' shape along with their size, by the same progress
    if (from.shape !== 1 || to.shape !== 1) {
      const k = Math.round(mix(from.shape, to.shape, smooth(t)) * 1000) / 1000;
      shape.style.setProperty("corner-shape", `superellipse(${k})`);
    } else shape.style.removeProperty("corner-shape");
    // The icon stays on the control's spot, fading as the shape leaves it
    const iconOpacity = String(1 - smooth(clamp01(t / ICON_SPAN)));
    for (const el of icon) {
      el.style.translate = `${from.x - x}px ${from.y - y}px`;
      el.style.opacity = iconOpacity;
    }
    if (lifted) {
      // The stub shrinks away in the group, under the lifted copy
      const s = 1 - smooth(clamp01(t / STUB_SPAN));
      stub.style.transform = `translate(${from.x - stubOrigin.x}px, ${from.y - stubOrigin.y}px) scale(${s})`;
    }

    // Content: centered on the shape, magnified and blurred as it comes in, clipped to it
    const c = 1 + (CONTENT_SCALE - 1) * (1 - smooth(clamp01((t - CONTENT_FROM) / CONTENT_SPAN)));
    const dx = x + w / 2 - to.x - (c * to.width) / 2;
    const dy = y + h / 2 - to.y - (c * to.height) / 2;
    content.style.transform = `translate(${dx}px, ${dy}px) scale(${c})`;
    // The shape's box in the content's own (untransformed) pixels
    const top = (y - to.y - dy) / c;
    const left = (x - to.x - dx) / c;
    const bottom = to.height - (y + h - to.y - dy) / c;
    const right = to.width - (x + w - to.x - dx) / c;
    content.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${px(radius / c)})`;
    content.style.opacity = String(smooth(clamp01((t - CONTENT_FROM) / (CONTENT_SPAN * 0.65))));
    const blur = CONTENT_BLUR * (1 - smooth(clamp01((t - CONTENT_FROM) / CONTENT_SPAN)));
    content.style.filter = blur > 0.33 ? `blur(${blur}px)` : "";
  };

  const launch = () => {
    icon = dress(shape);
    shape.style.display = "";
    shapeOrigin = originOf(shape);
    if (lifted) {
      dress(stub);
      stub.style.width = `${from.width}px`;
      stub.style.height = `${from.height}px`;
      stub.style.display = "";
      stubOrigin = originOf(stub);
    }
    shape.style.pointerEvents = isOpen ? "none" : "";
    source.style.visibility = "hidden";
    // Explicitly: a panel kept hidden by its stylesheet until the script runs still shows
    content.style.visibility = "visible";
  };

  const settle = () => {
    stub.style.display = "none";
    if (isOpen) {
      // At rest the content is itself again: nothing clipped, filtered or composited
      content.style.transform = "";
      content.style.clipPath = "";
      content.style.filter = "";
      content.style.opacity = "";
    } else {
      // The control takes over from its copy, which sits exactly where it is
      shape.style.display = "none";
      content.style.visibility = "hidden";
      source.style.visibility = "";
    }
    onRest?.(isOpen);
  };

  const at = (b: Box, p: number): Frame => ({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height, p });

  let motion: SpringAnimator<Channel> | null = null;
  const rest = () => {
    motion = null;
    content.style.pointerEvents = "";
    settle();
  };
  /** Morphs from `start` to `target`; one under way turns around, keeping its speed */
  const run = (start: Frame, target: Frame, set: MorphSprings) => {
    if (reduced.matches) {
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

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    win.clearTimeout(hold);
    source.setAttribute("aria-expanded", "true");
    remeasure();
    // Where it goes is settled at rest only: mid-way it turns around where it is
    if (!motion) lift(covers(to));
    launch();
    run(at(from, 0), at(to, 1), spring.open);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    source.setAttribute("aria-expanded", "false");
    remeasure();
    launch();
    content.style.pointerEvents = "none";
    const target = at(from, 0);
    if (motion || reduced.matches) {
      run(at(to, 1), target, spring.close);
      return;
    }
    // From rest the content goes first: the shape holds a beat where it is, then follows
    run(at(to, 1), { ...at(to, 1), p: 0 }, spring.close);
    hold = win.setTimeout(() => {
      if (!isOpen) motion?.to(target, channels(spring.close));
    }, CLOSE_HOLD * spring.close.width.duration * 1000);
  };

  source.setAttribute("aria-expanded", "false");

  return {
    get isOpen() {
      return isOpen;
    },
    open,
    close,
    toggle: () => (isOpen ? close() : open()),
    destroy() {
      win.clearTimeout(hold);
      motion?.stop();
      motion = null;
      shape.removeEventListener("click", forward);
      shape.remove();
      stub.remove();
      source.style.visibility = "";
      source.removeAttribute("aria-expanded");
      content.style.cssText = savedContent;
    },
  };
}

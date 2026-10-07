import { SpringAnimator, type SpringParams } from "./springAnimator";

/**
 * Morph: a control swells into a panel of the same glass and shrinks back. One piece of glass the
 * whole way: it grows from the control's box to the panel's, its corners going from the control's
 * real radius to the panel's (a capsule's `9999px` counts as half its height, as drawn). Opening,
 * width and height run on springs of their own, so it wobbles like jelly rather than scaling;
 * closing, they run together, so it lands exactly on the control. Corners, icon and content follow
 * a progress of their own that doesn't bounce: the size may wobble a while longer, the corners
 * stay still. The control's icon fades out as it swells and back in as it shrinks; the panel's
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
 * Boxes are read once per open and close, on screen; each piece is placed from where it sits
 * untransformed. A rotated or scaled ancestor isn't supported. With reduced motion the panel and the control swap at once.
 */

type Channel = "x" | "y" | "w" | "h" | "p";

/** Springs for the width (and left edge), the height (and top edge), and corners, icon and content */
export type MorphSprings = { width: SpringParams; height: SpringParams; progress: SpringParams };

export type MorphOptions = {
  /** The control it opens from */
  source: HTMLElement;
  /** The panel's content, laid out where the panel opens */
  content: HTMLElement;
  /** Springs one way and the other; progress shouldn't bounce, or the corners will */
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

type Box = { x: number; y: number; width: number; height: number; radius: number };
type Frame = Record<Channel, number>;

/** The springs a morph runs on unless given others */
export const defaultMorphSprings: { open: MorphSprings; close: MorphSprings } = {
  // Height a touch slower and bouncier than width: the wobble
  open: {
    width: { duration: 0.38, bounce: 0.34 },
    height: { duration: 0.43, bounce: 0.42 },
    progress: { duration: 0.32, bounce: 0 },
  },
  // Together and without a bounce, so it lands round and exactly the control's size
  close: {
    width: { duration: 0.34, bounce: 0 },
    height: { duration: 0.34, bounce: 0 },
    progress: { duration: 0.28, bounce: 0 },
  },
};
/** Where it's done: a quarter of a pixel, and a progress whose last bit moves nothing visible */
const PRECISION = { x: 0.25, y: 0.25, w: 0.25, h: 0.25, p: 0.002 };
/** Share of the progress over which the control's icon fades */
const ICON_SPAN = 0.25;
/** Lifted over a group: share of the progress over which the stub left in it shrinks away */
const STUB_SPAN = 0.35;
/** Content scale at the start: it comes in magnified */
const CONTENT_SCALE = 1.25;
/** Content blur at the start, px; below a third of a pixel it's dropped */
const CONTENT_BLUR = 12;
/** Press behaviors stay with the control: the copy only looks like it */
const BEHAVIORS = ["lb-highlight", "lb-swell", "lb-stretch", "lb-interactive"];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** To a hundredth of a pixel, so float noise doesn't reach the style */
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

export function createMorph({ source, content, spring = defaultMorphSprings, onRest }: MorphOptions): Morph {
  const parent = source.parentElement;
  if (!parent) throw new Error("morph: the source needs a parent");
  const doc = parent.ownerDocument;
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const channels = (s: MorphSprings): Record<Channel, SpringParams> => ({
    x: s.width,
    w: s.width,
    y: s.height,
    h: s.height,
    p: s.progress,
  });

  /** A copy of the control, pinned out of the flow at its parent's corner, moved by transform */
  const copy = () => {
    const el = source.cloneNode(false) as HTMLElement;
    el.removeAttribute("id");
    el.style.cssText =
      "position: absolute; left: 0; top: 0; margin: 0; box-sizing: border-box; contain: strict; " +
      "pointer-events: none; display: none";
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
  /** Dresses a copy as the control is now: its label or icon may have changed since */
  const dress = (el: HTMLElement) => {
    el.className = source.className;
    el.classList.remove(...BEHAVIORS);
    el.replaceChildren(...(source.cloneNode(true) as HTMLElement).childNodes);
    // The icon fades on its own, without the glass: loose text gets a box to carry the opacity
    for (const node of [...el.childNodes]) {
      if (node.nodeType !== 3 || !node.textContent?.trim()) continue;
      const span = doc.createElement("span");
      node.replaceWith(span);
      span.append(node);
    }
    return [...el.children] as (HTMLElement | SVGElement)[];
  };
  icon = dress(shape);
  source.after(stub, shape);

  const savedContent = content.style.cssText;
  content.style.visibility = "hidden";
  content.style.transformOrigin = "0 0";

  let isOpen = false;
  let from: Box = { x: 0, y: 0, width: 0, height: 0, radius: 0 };
  let to: Box = from;

  /** An element's box on screen */
  const measure = (el: HTMLElement): Box => {
    const r = el.getBoundingClientRect();
    const radius = parseFloat(win.getComputedStyle(el).borderTopLeftRadius) || 0;
    return { x: r.left, y: r.top, width: r.width, height: r.height, radius: Math.min(radius, r.width / 2, r.height / 2) };
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
    const { x, y } = f;
    const t = clamp01(f.p);

    /*
     * Corners: the control's real radius at the start, the panel's at the end, eased at both ends
     * so a progress that creeps the last bit of the way moves them by next to nothing. Never more
     * than the box allows, as the browser would draw it.
     */
    const radius = Math.min(w / 2, h / 2, mix(from.radius, to.radius, smooth(t)));
    shape.style.transform = `translate(${x - shapeOrigin.x}px, ${y - shapeOrigin.y}px)`;
    shape.style.width = `${w}px`;
    shape.style.height = `${h}px`;
    shape.style.borderRadius = px(radius);
    const iconOpacity = String(1 - clamp01(t / ICON_SPAN));
    for (const el of icon) el.style.opacity = iconOpacity;
    if (lifted) {
      // The stub shrinks away in the group, under the lifted copy
      const s = 1 - smooth(clamp01(t / STUB_SPAN));
      stub.style.transform = `translate(${from.x - stubOrigin.x}px, ${from.y - stubOrigin.y}px) scale(${s})`;
    }

    // Content: centered on the shape, magnified and blurred early on, clipped to it
    const c = mix(CONTENT_SCALE, 1, t);
    const dx = x + w / 2 - to.x - (c * to.width) / 2;
    const dy = y + h / 2 - to.y - (c * to.height) / 2;
    content.style.transform = `translate(${dx}px, ${dy}px) scale(${c})`;
    // The shape's box in the content's own (untransformed) pixels
    const top = (y - to.y - dy) / c;
    const left = (x - to.x - dx) / c;
    const bottom = to.height - (y + h - to.y - dy) / c;
    const right = to.width - (x + w - to.x - dx) / c;
    content.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${px(radius / c)})`;
    content.style.opacity = String(clamp01((t - 0.3) / 0.5));
    const blur = CONTENT_BLUR * (1 - t);
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

  const at = (b: Box, p: number): Frame => ({ x: b.x, y: b.y, w: b.width, h: b.height, p });

  let motion: SpringAnimator<Channel> | null = null;
  const rest = () => {
    motion = null;
    content.style.pointerEvents = "";
    settle();
  };
  /** Morphs from `start` to `target`; one under way turns around, keeping its speed */
  const run = (start: Frame, target: Frame, springs: MorphSprings) => {
    if (reduced.matches) {
      motion?.stop();
      motion = null;
      render(target);
      rest();
      return;
    }
    motion ??= new SpringAnimator(start, channels(springs), render, rest, PRECISION);
    motion.to(target, channels(springs));
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
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
    run(at(to, 1), at(from, 0), spring.close);
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

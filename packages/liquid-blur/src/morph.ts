import { SpringAnimator, type SpringParams } from "./springAnimator";

/**
 * Morph: a control swells into a panel of the same glass and shrinks back. One piece of glass the
 * whole way: it grows from the control's box to the panel's, its corners going from the control's
 * real radius to the panel's (a capsule's `9999px` counts as half its height, as drawn). Opening,
 * width and height run on springs of their own, so it wobbles like jelly rather than scaling;
 * closing, they run together, so it lands exactly on the control. Corners, icon and content follow
 * a progress of their own that doesn't bounce: the size may wobble a while longer, the corners
 * stay still. The control's icon fades out as it swells and back in as it shrinks; the panel's content comes in magnified and out of focus and
 * settles sharp.
 *
 * The control (`source`) stays where it is, hidden (`visibility: hidden`) while the morph is
 * anywhere but closed and at rest. Its stand-in, the shape that morphs, is a copy of it (icon and
 * all, without press behaviors: the control's transform and scale belong to those) placed next to
 * it in the same parent. Only the copy's translate, size and radius change: a contained box with
 * an icon in it, so its layout costs next to nothing. While it shrinks back a click on it goes to
 * the control, so the panel can be opened again before it's all the way home. In a glass group (`.lb-group`) the copy melts
 * with the control's neighbors as anything else there does, and the group leaves the hidden
 * control out. Open the panel beside its neighbors there, not over them: the group's glass is one
 * surface behind all its children, so the ones under the panel would show through it.
 *
 * The panel's `content` is laid out once where and as big as the open panel, and moves only
 * through transform, opacity, filter and clip-path, so its text never reflows. It's a sibling of
 * the glass, never its ancestor: a filter, opacity or clip on an ancestor of a backdrop-filter cuts
 * the glass off from what's behind it. Its computed border-radius is the panel's; its inline
 * transform, opacity, filter and clip-path belong to the morph while it moves.
 *
 * Boxes are read once per open and close, relative to the control's parent: a rotated or scaled
 * ancestor isn't supported. With reduced motion the panel and the control swap at once.
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

  const shape = source.cloneNode(true) as HTMLElement;
  shape.removeAttribute("id");
  shape.classList.remove(...BEHAVIORS);
  shape.style.cssText =
    "position: absolute; left: 0; top: 0; margin: 0; box-sizing: border-box; contain: strict; " +
    "pointer-events: none; display: none";
  shape.setAttribute("aria-hidden", "true");
  shape.tabIndex = -1;
  // While it shrinks back the control is hidden: a press on it is a press on the control
  const forward = (e: MouseEvent) => {
    e.stopPropagation();
    source.click();
  };
  shape.addEventListener("click", forward);
  let icon: (HTMLElement | SVGElement)[] = [];
  /** Dresses the copy as the control is now: its label or icon may have changed since */
  const dress = () => {
    shape.className = source.className;
    shape.classList.remove(...BEHAVIORS);
    shape.replaceChildren(...(source.cloneNode(true) as HTMLElement).childNodes);
    // The icon fades on its own, without the glass: loose text gets a box to carry the opacity
    for (const node of [...shape.childNodes]) {
      if (node.nodeType !== 3 || !node.textContent?.trim()) continue;
      const span = doc.createElement("span");
      node.replaceWith(span);
      span.append(node);
    }
    icon = [...shape.children] as (HTMLElement | SVGElement)[];
  };
  dress();
  source.after(shape);

  const savedContent = content.style.cssText;
  content.style.visibility = "hidden";
  content.style.transformOrigin = "0 0";

  let isOpen = false;
  let from: Box = { x: 0, y: 0, width: 0, height: 0, radius: 0 };
  let to: Box = from;

  /** An element's box relative to the parent's padding box, without the transform we put on it */
  const measure = (el: HTMLElement, origin: DOMRect): Box => {
    const r = el.getBoundingClientRect();
    const radius = parseFloat(win.getComputedStyle(el).borderTopLeftRadius) || 0;
    return {
      x: r.left - origin.left - parent.clientLeft,
      y: r.top - origin.top - parent.clientTop,
      width: r.width,
      height: r.height,
      radius: Math.min(radius, r.width / 2, r.height / 2),
    };
  };
  /**
   * The box an element has at rest: its inline transforms off for the measurement. A control just
   * pressed is still swollen (`lb-swell` writes `scale`) or pulled (`lb-stretch`, `transform`);
   * measured as is, the panel would close into a box bigger than the control and off its corners.
   * Put back in the same task, so nothing in between is ever painted.
   */
  const atRest = (el: HTMLElement, origin: DOMRect): Box => {
    const { transform, scale, translate, rotate } = el.style;
    el.style.transform = el.style.scale = el.style.translate = el.style.rotate = "none";
    const box = measure(el, origin);
    Object.assign(el.style, { transform, scale, translate, rotate });
    return box;
  };
  const remeasure = () => {
    const origin = parent.getBoundingClientRect();
    to = atRest(content, origin);
    // Only while the control is in place: once away, the box it left is the one to come back to
    if (source.style.visibility !== "hidden") from = atRest(source, origin);
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
    shape.style.transform = `translate(${x}px, ${y}px)`;
    shape.style.width = `${w}px`;
    shape.style.height = `${h}px`;
    shape.style.borderRadius = px(radius);
    const iconOpacity = String(1 - clamp01(t / ICON_SPAN));
    for (const el of icon) el.style.opacity = iconOpacity;

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
    dress();
    shape.style.display = "";
    shape.style.pointerEvents = isOpen ? "none" : "";
    source.style.visibility = "hidden";
    // Explicitly: a panel kept hidden by its stylesheet until the script runs still shows
    content.style.visibility = "visible";
  };

  const settle = () => {
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
      source.style.visibility = "";
      source.removeAttribute("aria-expanded");
      content.style.cssText = savedContent;
    },
  };
}

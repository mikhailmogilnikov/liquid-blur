import { AWAY, PART, SURFACE, SpringAnimator, type SpringParams } from "@liquid-web/core";

/**
 * Morph: one element flows into another. Its states are real elements, each laid out where and as
 * it is at rest; one is shown, the others are away. Asked for another, the one shown steps out and
 * a single shape flows from its box to the other's: each corner from its real radius to the
 * other's (a capsule's `9999px` counts as half its height, as drawn; a percent as the box makes
 * it), always circular, never an oval. Where the browser draws `corner-shape`, the corners' shape
 * goes along too, as a superellipse. Center, width and height move on springs of their own that
 * set off from a standstill, overshoot at most once and settle without swinging again: lively,
 * never jelly. Corners and contents follow a progress of their own that doesn't overshoot. At rest
 * the shape is gone and the state asked for is itself again: nothing of the morph stays on it.
 *
 * The shape is the bigger one's backdrop and outer shadow; its surface lies in it as a fill dressed
 * as the bigger one (its classes and attributes, without press behaviors or who it is). Where the
 * smaller one's is another (as drawn: fill, border, shadow, backdrop, pseudo-elements), that one
 * lies over it as a fill too, fading as the shape grows (a solid control dissolves into glass, a
 * tint into none). In a glass group the shape wears the bigger one's classes itself instead, as
 * the group needs to melt it, and surfaces don't fade.
 *
 * The bigger one flies itself, either way: laid out once where it is at rest, it rides the middle
 * of the shape through transform, opacity, filter and clip-path alone (magnified and out of focus,
 * settling sharp), so its text never reflows, and it's live the whole way: pressed, typed into,
 * playing. Its own surface steps aside for the shape's meanwhile (background, border, shadow,
 * backdrop: its pseudo-elements stay), and it has to be above the shape (`z-index: 2` or more).
 * Its inline transform, opacity, filter and clip-path are the morph's while it flies; a
 * translation of its own in the stylesheet (`translate: -50% -50%`, or the same as `transform`) is
 * kept. The smaller one rides in the shape as a copy of it, frozen as it was when the shape set off,
 * where it is in its element, fading as the shape leaves it. Pieces marked with the same
 * `data-lw-match` in both fly from where they are in one to where they are in the other, as far
 * along as the shape's size is, and cross over from one to the other on the way. Turned around,
 * the copies are taken again as the states are then.
 *
 * Turned around mid-way it heads back keeping its speed; sent to a third state mid-way it starts
 * over from where it is, the contents on their way fading where they are.
 *
 * Away, a state is unseen (`opacity: 0`, `visibility: hidden`, marked `data-lw-away`) and takes no
 * presses. One holding focus as it goes keeps it: it's only made transparent, still focusable and
 * read. A press on the shape on its way is a press on the smallest state whose box is under it at
 * rest, so a control can be pressed again before the shape is all the way home.
 *
 * The shape is placed next to the smaller state, in the same parent; out of the flow, at
 * rest the parent has its own children and no others. A `container` takes it instead, out of a
 * parent that would clip it (`overflow: hidden`). What it and the copies in it inherit (theme,
 * custom properties) is from where it's placed; their own classes come with them, selectors
 * through the elements' parents don't.
 *
 * In a glass group (a parent a group runs on, marked `data-lw-surface`: see @liquid-web/core) the
 * shape is placed next to the state that's in the group, and how it goes depends on the other:
 *   - beside the neighbors (and no container): it stays in the group and melts with them on the
 *     way, as anything there does
 *   - over any of them, or into a container: the group's glass is one surface behind all its
 *     children, so they'd show through it. It's lifted out instead, right after the group (or into
 *     the container), as glass of its own above it (`z-index: 1`), blurring what it covers. A stub
 *     stays in the group where the state was, melted with its neighbors, and shrinks away under it
 *     (or grows back), so the neck to the neighbors comes and goes with the flight.
 *
 * Where `corner-shape` isn't drawn, corners stay round arcs and the morph leaves it alone. In a
 * glass group the melted outline is drawn from round arcs, so while the shape melts with its
 * neighbors its corners are round.
 *
 * Boxes are read when a flight sets off, and again on a scroll, a window resize or `update()`, on
 * screen; each piece is placed from where it sits untransformed. A rotated or scaled ancestor isn't
 * supported. With reduced motion, or asked to be instant, the states swap at once.
 */

/** The shape's center, its size, and a progress from one end of the flight to the other */
type Channel = "cx" | "cy" | "w" | "h" | "p";

/**
 * Springs for the center's travel (`x`, `y`), the size (`width`, `height`), and the progress that
 * corners and contents follow. A spring's `bounce` is how far it overshoots, its `settle` how it
 * comes back after: low, and it overshoots once and no more.
 */
export type MorphSprings = {
  x: SpringParams;
  y: SpringParams;
  width: SpringParams;
  height: SpringParams;
  progress: SpringParams;
};

export type MorphOptions = {
  /** The elements it flows between, each laid out where and as it is at rest */
  states: HTMLElement[];
  /** The one shown at the start; the first unless given */
  initial?: HTMLElement;
  /** Where the shape goes instead of next to the state it sets off from: out of a parent that would clip it */
  container?: HTMLElement;
  /** Springs growing into a bigger box and shrinking into a smaller one; any left out are the defaults' */
  spring?: { grow?: Partial<MorphSprings>; shrink?: Partial<MorphSprings> };
  /** Called when a flight sets off, turning around or heading elsewhere included */
  onStart?: (to: HTMLElement, from: HTMLElement) => void;
  /** Called when it comes to rest as a state */
  onRest?: (at: HTMLElement) => void;
};

/** `instant`: the states swap at once, as with reduced motion */
export type MorphMove = { instant?: boolean };

export type Morph = {
  /** The state asked for, at once; `moving` says whether it's there yet */
  readonly current: HTMLElement;
  readonly moving: boolean;
  /**
   * Flows into `state`. Resolves when it comes to rest: `true` there, `false` if it was sent
   * elsewhere or destroyed first. Asked for where it already is (or is going), the same answer.
   */
  to(state: HTMLElement, move?: MorphMove): Promise<boolean>;
  /** Reads the boxes again and follows them: for a state moved by something unseen */
  update(): void;
  destroy(): void;
};

/** Corner radii, clockwise from the top left */
type Radii = [number, number, number, number];
/**
 * A box on screen, its corners' radii, and their shape as a superellipse exponent (the top left
 * one's: a box with corners of different shapes is rare enough)
 */
type Box = { x: number; y: number; width: number; height: number; radii: Radii; shape: number };
type Frame = Record<Channel, number>;

/**
 * A copy riding in the shape, and where it was last drawn: its top left corner on screen, its
 * scale about that corner, its opacity and blur. `w` and `h` are its own size, unscaled.
 */
type Piece = {
  node: HTMLElement;
  /** The element it's a copy of, until it has taken what that one inherits */
  of?: Element;
  w: number;
  h: number;
  left: number;
  top: number;
  s: number;
  o: number;
  blur: number;
};
/**
 * Where a piece is along one side of its element: held at the nearer edge (`d` px in from it) or at
 * the middle (`d` px off it), whichever it's closest to
 */
type Hold = { to: "start" | "middle" | "end"; d: number };
/** A piece in both ends, by where it's held in its element across and down, and its size */
type Spot = { x: Hold; y: Hold; w: number; h: number };
type Match = { a: Piece; b: Piece; at: [Spot, Spot] };
/** One side of a piece in an element: its start and size along it, the element's the same */
const holdOf = (start: number, size: number, from: number, side: number): Hold => {
  const before = start - from;
  const after = from + side - (start + size);
  const off = start + size / 2 - (from + side / 2);
  const least = Math.min(before, after, Math.abs(off));
  return least === Math.abs(off)
    ? { to: "middle", d: off }
    : least === before
      ? { to: "start", d: before }
      : { to: "end", d: after };
};
/** Where a held piece's middle is, in a side starting at `from`, `side` long, the piece `size` long */
const middleOf = ({ to, d }: Hold, from: number, side: number, size: number) =>
  to === "start" ? from + d + size / 2 : to === "end" ? from + side - d - size / 2 : from + side / 2 + d;
/**
 * The bigger end flying itself: its own transform from the stylesheet, which the morph's goes on
 * top of, and the translation in it; where it was last drawn, as a piece; its matched pieces,
 * unseen while copies of them fly, with their own inline visibility to give back
 */
type Live = {
  el: HTMLElement;
  base: string;
  shift: { x: number; y: number };
  piece: Piece;
  own: Record<string, string>;
  twins: [HTMLElement, string][];
};
/** One end of a flight: a state, or (started over mid-way) where the shape was, with no state */
type End = { el: HTMLElement | null; box: Box; layer: Piece | null };

/**
 * The springs a morph runs on unless given others. Growing, the shape heads for the bigger box's
 * center first, runs past it once (further vertically) and settles back into place, while it
 * swells evenly all around, slower, catching up as it arrives. Shrinking from rest, the shape holds
 * a beat while the contents blur away, then goes, the width first, the height after, and settles
 * onto the smaller box without going past it.
 */
export const defaultMorphSprings: { grow: MorphSprings; shrink: MorphSprings } = {
  grow: {
    // Bouncy out (7% past, 17% vertically), then back without a second swing
    x: { duration: 0.19, bounce: 0.35, settle: 0.15 },
    y: { duration: 0.25, bounce: 0.53, settle: 0.15 },
    width: { duration: 0.34, bounce: 0.12 },
    height: { duration: 0.34, bounce: 0.12 },
    progress: { duration: 0.3, bounce: 0.1 },
  },
  shrink: {
    x: { duration: 0.26, bounce: 0.1 },
    y: { duration: 0.3, bounce: 0.1 },
    width: { duration: 0.24, bounce: 0.1 },
    height: { duration: 0.28, bounce: 0.1 },
    progress: { duration: 0.22, bounce: 0.1 },
  },
};
/** Where it's done: a quarter of a pixel, and a progress whose last bit moves nothing visible */
const PRECISION = { cx: 0.25, cy: 0.25, w: 0.25, h: 0.25, p: 0.002 };
/** Share of the progress, from the smaller end, over which the smaller one's contents fade */
const SMALL_SPAN = 0.3;
/** Share of the progress, from the smaller end, over which its surface fades into the bigger one's */
const SKIN_SPAN = 0.6;
/** What a surface is drawn with: two that differ in none of these are the same */
const SURFACE_PROPS = [
  "background-color",
  "background-image",
  "border-top-color",
  "border-top-width",
  "border-top-style",
  "box-shadow",
  "backdrop-filter",
  "opacity",
  "content",
];
/** What the morph writes on the state flying itself, given back when it lands */
const LIVE_PROPS = [
  "transform",
  "transform-origin",
  "clip-path",
  "filter",
  "opacity",
  "visibility",
  "pointer-events",
  "background",
  "border-color",
  "box-shadow",
  "outline",
  "backdrop-filter",
  "-webkit-backdrop-filter",
];
/** Of those, its surface: what the shape draws for it on the way */
const LIVE_SURFACE = [
  "background",
  "border-color",
  "box-shadow",
  "outline",
  "backdrop-filter",
  "-webkit-backdrop-filter",
];
/** What the shape keeps of the bigger one while the fills are in it */
const CARRIED = ["backdrop-filter", "-webkit-backdrop-filter", "box-shadow"];
/** What of an element's attributes isn't its look, left off a copy wearing it */
const NOT_LOOK = /^(id|style|name|tabindex|autofocus|inert|hidden|on.*|data-lw-away)$/;
/** Shrinking from rest, the shape holds this share of its width's duration before it goes */
const SHRINK_HOLD = 0.12;
/** Lifted over a group: share of the progress over which the stub left in it shrinks away */
const STUB_SPAN = 0.35;
/** The bigger one's contents' scale at the smaller end: they come in magnified */
const BIG_SCALE = 1.45;
/**
 * Where in the progress from the smaller end the bigger one's contents start coming in (early,
 * while the shape is still small) and over how much of it they focus and settle to scale: nearly
 * the whole flight. They're fully opaque about two thirds of the way.
 */
const BIG_FROM = 0.08;
const BIG_SPAN = 0.87;
/** Their blur at the smaller end, px; below a third of a pixel it's dropped */
const BIG_BLUR = 14;
/** Share of the progress in the middle over which matched pieces cross over */
const MATCH_FROM = 0.2;
const MATCH_SPAN = 0.6;
/**
 * Press behaviors stay with the states: the copies only look like them. Press behaviors skip a
 * `data-lw-part` already; their classes come off too, so their CSS without the script (`:active`)
 * doesn't scale the copies either. Names only: nothing of theirs is loaded.
 */
const BEHAVIORS = ["lb-highlight", "lb-swell", "lb-stretch", "lb-interactive"];
/** What a copy inherits from where it was, taken along: it rides somewhere else */
const INHERITED = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-align",
  "direction",
];
/** An element's surface, left out of a copy of it: the shape is the surface */
const BARE =
  "background: none; border-color: transparent; box-shadow: none; outline: none; " +
  "backdrop-filter: none; -webkit-backdrop-filter: none";
/**
 * A copy out of the flow, pinned at its parent's corner and moved by transform alone: whatever its
 * classes say about where it goes, how it moves, what it stacks over or whether it shows
 */
const PINNED =
  "position: absolute; left: 0; top: 0; right: auto; bottom: auto; margin: 0; box-sizing: border-box; " +
  "min-width: 0; min-height: 0; max-width: none; max-height: none; translate: none; rotate: none; " +
  "scale: none; z-index: auto; visibility: visible; transition: none; animation: none; pointer-events: none";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const area = (b: { width: number; height: number }) => b.width * b.height;

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
/** The translation in a computed `transform` (a matrix, or `none`) */
const shiftOf = (transform: string) => {
  const m = /^matrix(3d)?\((.*)\)$/.exec(transform);
  if (!m) return { x: 0, y: 0 };
  const v = m[2].split(",").map(parseFloat);
  const [x, y] = m[1] ? [v[12], v[13]] : [v[4], v[5]];
  return { x: x || 0, y: y || 0 };
};

export function createMorph({
  states,
  initial = states[0],
  container,
  spring: given,
  onStart,
  onRest,
}: MorphOptions): Morph {
  if (!states.length) throw new Error("morph: it needs states");
  if (!states.includes(initial)) throw new Error("morph: the initial state isn't one of its states");
  for (const el of states) if (!el.parentElement) throw new Error("morph: each state needs a parent");
  const spring = {
    grow: { ...defaultMorphSprings.grow, ...given?.grow },
    shrink: { ...defaultMorphSprings.shrink, ...given?.shrink },
  };
  const doc = initial.ownerDocument;
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

  /**
   * An element's inline transforms off for a moment: a control just pressed is still swollen or
   * pulled, a state flying itself is moved by the morph. Its stylesheet's stay: they're where it is.
   */
  const still = <T>(el: HTMLElement, read: () => T, to = ""): T => {
    const { transform, scale, translate, rotate } = el.style;
    el.style.transform = el.style.scale = el.style.translate = el.style.rotate = to;
    const value = read();
    Object.assign(el.style, { transform, scale, translate, rotate });
    return value;
  };

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
  /** The box a state has at rest, put back in the same task so nothing in between is ever painted */
  const atRest = (el: HTMLElement) => still(el, () => measure(el));

  /** What a copy mustn't take along: who it is, what it plays, which radio group it's in */
  const scrub = (root: HTMLElement) => {
    for (const el of [root, ...root.querySelectorAll<HTMLElement>("[id], [name], [autofocus], [autoplay]")]) {
      el.removeAttribute("id");
      el.removeAttribute("name");
      el.removeAttribute("autofocus");
      el.removeAttribute("autoplay");
    }
    root.classList.remove(...BEHAVIORS);
    root.removeAttribute(AWAY);
    root.setAttribute(PART, "");
    root.setAttribute("aria-hidden", "true");
    root.inert = true;
  };
  /** What `el` inherits, written on a copy of it */
  /**
   * What copies inherit where they ride, made what their elements inherit: only where it differs,
   * once they're in place. A value written is a computed one (a unitless line height comes out in
   * pixels, and children with another font size would take those pixels), so where it's the same
   * it's left to inherit as it would.
   */
  const inherit = (pieces: (Piece | null)[]) => {
    const todo = pieces.filter((piece): piece is Piece & { of: Element } => !!piece?.of);
    // All reads first, then all writes: one style pass
    const changes = todo.map(({ node, of }) => {
      const want = win.getComputedStyle(of);
      const have = win.getComputedStyle(node);
      return INHERITED.map((name) => [name, want.getPropertyValue(name), have.getPropertyValue(name)] as const).filter(
        ([, a, b]) => a !== b,
      );
    });
    todo.forEach((piece, i) => {
      for (const [name, value] of changes[i]) piece.node.style.setProperty(name, value);
      (piece as Piece).of = undefined;
    });
  };
  /**
   * A state's contents as a copy: the element without its surface, at its size, its children as
   * they are now. A matched piece in it is left unseen: it flies on its own.
   */
  const layerOf = (el: HTMLElement, box: Box, matched: Set<string>): Piece => {
    const node = el.cloneNode(true) as HTMLElement;
    scrub(node);
    node.style.cssText += `; ${BARE}; ${PINNED}; transform-origin: 0 0; width: ${box.width}px; height: ${box.height}px`;
    for (const key of matched) {
      const twin = node.querySelector<HTMLElement>(`[data-lw-match="${win.CSS.escape(key)}"]`);
      if (twin) twin.style.visibility = "hidden";
    }
    return { node, of: el, w: box.width, h: box.height, left: box.x, top: box.y, s: 1, o: 1, blur: 0 };
  };
  /** A matched piece as a copy, at its size, flying on its own */
  const pieceOf = (el: HTMLElement, r: DOMRect): Piece => {
    const node = el.cloneNode(true) as HTMLElement;
    scrub(node);
    node.style.cssText += `; ${PINNED}; transform-origin: 0 0; width: ${r.width}px; height: ${r.height}px`;
    // A line of text stays one: at its width to the pixel, a fraction short would wrap it
    const style = win.getComputedStyle(el);
    // `normal` is about 1.2 of the font size
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    if (!(r.height >= line * 1.5)) node.style.whiteSpace = "nowrap";
    return { node, of: el, w: r.width, h: r.height, left: r.left, top: r.top, s: 1, o: 1, blur: 0 };
  };
  /** The pieces two states share, each by its `data-lw-match`, where they are in each at rest */
  const matchesOf = (a: HTMLElement, aBox: Box, b: HTMLElement, bBox: Box) => {
    const marked = (el: HTMLElement) =>
      new Map([...el.querySelectorAll<HTMLElement>("[data-lw-match]")].map((m) => [m.dataset.lwMatch ?? "", m]));
    const inA = marked(a);
    const inB = marked(b);
    const spot = (r: DOMRect, box: Box): Spot => ({
      x: holdOf(r.left, r.width, box.x, box.width),
      y: holdOf(r.top, r.height, box.y, box.height),
      w: r.width,
      h: r.height,
    });
    const matches: Match[] = [];
    for (const [key, ma] of inA) {
      const mb = inB.get(key);
      if (!key || !mb) continue;
      const ra = still(a, () => ma.getBoundingClientRect());
      const rb = still(b, () => mb.getBoundingClientRect());
      if (!ra.width || !ra.height || !rb.width || !rb.height) continue;
      matches.push({ a: pieceOf(ma, ra), b: pieceOf(mb, rb), at: [spot(ra, aBox), spot(rb, bBox)] });
    }
    return matches;
  };

  /** The one that flows: dressed for each flight as the state it's headed for */
  const shape = doc.createElement("div");
  /** Lifted over a group: the one that stays in it, where the state was */
  let stub: HTMLElement | null = null;
  /** The shape's border: a copy in it is placed from inside it */
  let rim = { x: 0, y: 0 };
  /** `copy` dressed as `el` looks: its classes and the attributes its CSS may go by (scoped styles') */
  const wear = (copy: HTMLElement, el: HTMLElement) => {
    // A snapshot of the names: removing them changes the live list
    for (const { name } of Array.from(copy.attributes)) if (name !== "style") copy.removeAttribute(name);
    for (const { name, value } of el.attributes) if (!NOT_LOOK.test(name)) copy.setAttribute(name, value);
    copy.classList.remove(...BEHAVIORS);
    copy.setAttribute(PART, "");
    copy.setAttribute("aria-hidden", "true");
    if (copy === shape && shape.isConnected) rim = { x: shape.clientLeft, y: shape.clientTop };
  };
  /**
   * The surfaces as fills in the shape, the smaller one's (when it's another) and the bigger one's,
   * one fading into the other; the shape itself only the backdrop and the outer shadow. Outside a
   * glass group the shape wears no classes of its own: copies in an element dressed as the bigger
   * one would be its descendants to its stylesheet (`.panel button`), and laid out as those.
   */
  let skins: { small: HTMLElement | null; big: HTMLElement } | null = null;
  /** A surface as drawn: what the element and its pseudo-elements paint, not what classes it has */
  const surfaceOf = (el: HTMLElement) =>
    [null, "::before", "::after"]
      .map((pseudo) => {
        const style = win.getComputedStyle(el, pseudo);
        if (pseudo && (style.content === "none" || style.content === "normal")) return "";
        return SURFACE_PROPS.map((name) => style.getPropertyValue(name)).join("|");
      })
      .join("/");
  /** A fill dressed as `el` looks, without press behaviors, hover or the morph's own styles */
  const skinOf = (el: HTMLElement) => {
    const skin = doc.createElement("div");
    wear(skin, el);
    skin.style.cssText = `${PINNED}; transform-origin: 0 0; border-radius: inherit; corner-shape: inherit`;
    return skin;
  };
  /** The shadows in a computed `box-shadow` that fall outside the box, which a fill in the shape can't draw */
  const outer = (shadow: string) =>
    shadow === "none"
      ? "none"
      : shadow
          .split(/,(?![^(]*\))/)
          .filter((one) => !/\binset\b/.test(one))
          .join(",") || "none";
  /**
   * The shape dressed as nothing but the bigger one's backdrop and outer shadow, its surfaces as
   * fills in it: the bigger one's, and the smaller one's over it if it's another as drawn
   */
  const fill = (small: HTMLElement | null, big: HTMLElement) => {
    const bigSkin = skinOf(big);
    const smallSkin = small ? skinOf(small) : null;
    shape.prepend(...(smallSkin ? [bigSkin, smallSkin] : [bigSkin]));
    const keepSmall = !!smallSkin && surfaceOf(smallSkin) !== surfaceOf(bigSkin);
    if (smallSkin && !keepSmall) smallSkin.remove();
    const carried = win.getComputedStyle(bigSkin);
    const values = CARRIED.map((name) =>
      name === "box-shadow" ? outer(carried.getPropertyValue(name)) : carried.getPropertyValue(name),
    );
    for (const { name } of Array.from(shape.attributes)) if (name !== "style") shape.removeAttribute(name);
    shape.setAttribute(PART, "");
    shape.setAttribute("aria-hidden", "true");
    CARRIED.forEach((name, i) => shape.style.setProperty(name, values[i]));
    rim = { x: 0, y: 0 };
    const fills = keepSmall ? [bigSkin, smallSkin!] : [bigSkin];
    // The backdrop is the shape's; the inner rims stay the fills' (the outer shadow is cut off in it)
    for (const skin of fills) {
      skin.style.setProperty("backdrop-filter", "none");
      skin.style.setProperty("-webkit-backdrop-filter", "none");
    }
    return { small: keepSmall ? smallSkin : null, big: bigSkin };
  };
  // A press on the shape on its way is a press on the smallest state under it at rest
  const forward = (e: MouseEvent) => {
    e.stopPropagation();
    if (!flight) return;
    const under = [flight.a, flight.b]
      .filter((end): end is End & { el: HTMLElement } => {
        const { el, box } = end;
        return (
          !!el &&
          e.clientX >= box.x &&
          e.clientX <= box.x + box.width &&
          e.clientY >= box.y &&
          e.clientY <= box.y + box.height
        );
      })
      .sort((p, q) => area(p.box) - area(q.box))[0];
    under?.el.click();
  };
  shape.style.cssText = `${PINNED}; contain: strict; overflow: hidden; pointer-events: auto`;
  shape.addEventListener("click", forward);

  /** Each state's own inline styles the morph writes, to give back */
  const saved = new Map(
    states.map((el) => [
      el,
      { opacity: el.style.opacity, visibility: el.style.visibility, pointerEvents: el.style.pointerEvents },
    ]),
  );
  const show = (el: HTMLElement) => {
    const own = saved.get(el)!;
    el.removeAttribute(AWAY);
    el.style.opacity = own.opacity;
    el.style.pointerEvents = own.pointerEvents;
    // Explicitly: a state kept hidden by its stylesheet until the script runs still shows
    el.style.visibility = "visible";
  };
  /** Unseen and out of the way; one holding focus keeps it, only made transparent */
  const away = (el: HTMLElement) => {
    el.setAttribute(AWAY, "");
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    if (!el.contains(doc.activeElement)) el.style.visibility = "hidden";
  };

  /** Its matched pieces unseen while copies of them fly, with their own inline visibility to give back */
  const hide = (el: HTMLElement, matched: Set<string>) => {
    const twins: [HTMLElement, string][] = [];
    for (const key of matched) {
      const twin = el.querySelector<HTMLElement>(`[data-lw-match="${win.CSS.escape(key)}"]`);
      if (!twin) continue;
      twins.push([twin, twin.style.visibility]);
      twin.style.visibility = "hidden";
    }
    return twins;
  };
  const unhide = (twins: [HTMLElement, string][]) => {
    for (const [twin, visibility] of twins) twin.style.visibility = visibility;
  };
  /** A state set flying itself: in sight, without its surface, its matched pieces unseen */
  const goLive = (el: HTMLElement, box: Box, matched: Set<string>): Live => {
    const { base, shift } = still(el, () => {
      const transform = win.getComputedStyle(el).transform;
      return { base: transform && transform !== "none" ? ` ${transform}` : "", shift: shiftOf(transform) };
    });
    const own = Object.fromEntries(LIVE_PROPS.map((name) => [name, el.style.getPropertyValue(name)]));
    el.style.cssText += `; ${BARE}; visibility: visible; transform-origin: 0 0`;
    const twins = hide(el, matched);
    const piece = { node: el, w: box.width, h: box.height, left: box.x, top: box.y, s: 1, o: 0, blur: 0 };
    return { el, base, shift, piece, own, twins };
  };
  /** A state flying itself landed, or let go: its own inline styles back */
  const ground = ({ el, own, twins }: Live, surface = true) => {
    for (const name of LIVE_PROPS) {
      if (surface || !LIVE_SURFACE.includes(name)) el.style.setProperty(name, own[name]);
    }
    unhide(twins);
  };
  /**
   * The one flying itself, let go: it's back in place first, its surface a frame later. Safari,
   * given back a backdrop in the frame that takes a transform and a clip off, draws it where they
   * had it, even on one just hidden. Landed as it, the shape stays under it till then (the same
   * box, the same surface: nothing shows).
   */
  let landing: (() => void) | null = null;
  const letGo = (live: Live, then?: () => void) => {
    ground(live, false);
    landing?.();
    const frame = win.requestAnimationFrame(() => landing?.());
    landing = () => {
      landing = null;
      win.cancelAnimationFrame(frame);
      for (const name of LIVE_SURFACE) live.el.style.setProperty(name, live.own[name]);
      then?.();
    };
  };

  /** The flight under way: its ends, the progress from `a` (0) to `b` (1), and which way it heads */
  let flight: {
    a: End;
    b: End;
    toward: "a" | "b";
    matches: Match[];
    /** Contents on their way when it started over, fading where they are */
    ghosts: Piece[];
    /** Where the stub's state is in the flight: its share of each end */
    stubAt: [number, number];
    /** The bigger end, if it's a state: it flies itself */
    live: (Live & { end: "a" | "b" }) | null;
  } | null = null;
  /** Where the shape lives: next to `anchor`, or lifted out over its group or into the container */
  let anchor: HTMLElement = initial;
  let lifted = false;
  /** Where the shape's (and stub's) untransformed corner is on screen: its translate is measured from there */
  let origin = { x: 0, y: 0 };
  let stubOrigin = { x: 0, y: 0 };
  /** The stub's state's box: where the stub stays */
  let stubBox: Box | null = null;
  /** What the shape last drew: corners started over from there */
  let drawn = { radii: [0, 0, 0, 0] as Radii, shape: 1 };

  /** Whether an element's parent is one surface of glass now: a group runs on it */
  const grouped = (el: HTMLElement) => !!el.parentElement?.hasAttribute(SURFACE);
  /** Whether a box would cover any of `el`'s neighbors in its group */
  const covers = (el: HTMLElement, box: Box) =>
    grouped(el) &&
    [...el.parentElement!.children].some((n) => {
      if (n === el || !(n instanceof HTMLElement) || n.hasAttribute(PART) || n.hasAttribute(AWAY)) return false;
      if (win.getComputedStyle(n).visibility === "hidden") return false;
      const r = n.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.left < box.x + box.width &&
        r.right > box.x &&
        r.top < box.y + box.height &&
        r.bottom > box.y
      );
    });
  /** Puts `el` right after `after`, unless it's there already: moving it would restart its paint */
  const follow = (after: Element, el: Element) => {
    if (after.nextSibling !== el) after.after(el);
  };
  const place = () => {
    if (stub) follow(anchor, stub);
    if (!lifted) follow(anchor, shape);
    else if (!container) follow(anchor.parentElement!, shape);
    else if (container.lastChild !== shape) container.append(shape);
  };
  const reorigin = () => {
    rim = { x: shape.clientLeft, y: shape.clientTop };
    // The shape's (and stub's) transform is only ever the morph's: whatever their classes say, none
    origin = still(
      shape,
      () => {
        const r = shape.getBoundingClientRect();
        return { x: r.left, y: r.top };
      },
      "none",
    );
    if (stub) {
      const s = stub;
      stubOrigin = still(
        s,
        () => {
          const r = s.getBoundingClientRect();
          return { x: r.left, y: r.top };
        },
        "none",
      );
    }
  };

  /** A piece drawn where it was last put, relative to the shape at `x`, `y` */
  const draw = (piece: Piece, x: number, y: number) => {
    const { node } = piece;
    node.style.transform = `translate(${px(piece.left - x - rim.x)}, ${px(piece.top - y - rim.y)}) scale(${Math.round(piece.s * 10000) / 10000})`;
    node.style.opacity = String(Math.round(piece.o * 1000) / 1000);
    node.style.filter = piece.blur > 0.33 ? `blur(${px(piece.blur)})` : "";
  };
  /** The smaller end's contents: where they are in their element, fading as the shape leaves it */
  const small = (u: number) => 1 - smooth(clamp01(u / SMALL_SPAN));
  /** The bigger end's contents: their scale, blur and opacity, `u` from the smaller end */
  const big = (u: number) => {
    const k = smooth(clamp01((u - BIG_FROM) / BIG_SPAN));
    return {
      s: 1 + (BIG_SCALE - 1) * (1 - k),
      blur: BIG_BLUR * (1 - k),
      o: smooth(clamp01((u - BIG_FROM) / (BIG_SPAN * 0.65))),
    };
  };

  const render = (f: Frame) => {
    if (!flight) return;
    const { a, b } = flight;
    const w = Math.max(0, f.w);
    const h = Math.max(0, f.h);
    const x = f.cx - w / 2;
    const y = f.cy - h / 2;
    const p = clamp01(f.p);

    /*
     * Corners: each going from one end's real radius to the other's, the same on both axes: always
     * circular, never an oval. Driven by the progress alone, eased at both ends, so a size still
     * wobbling leaves them still. Never more than the box allows, as the browser would draw it.
     */
    const e = smooth(p);
    const radii = fit(a.box.radii.map((r, i) => mix(r, b.box.radii[i], e)) as Radii, w, h);
    const k = Math.round(mix(a.box.shape, b.box.shape, e) * 1000) / 1000;
    drawn = { radii, shape: k };

    shape.style.transform = `translate(${px(x - origin.x)}, ${px(y - origin.y)})`;
    shape.style.width = px(w);
    shape.style.height = px(h);
    shape.style.borderRadius = radiiCss(radii);
    // The corners' shape along with their size, by the same progress
    if (a.box.shape !== 1 || b.box.shape !== 1) shape.style.setProperty("corner-shape", `superellipse(${k})`);
    else shape.style.removeProperty("corner-shape");

    // Contents: the smaller end's stay where they are, the bigger end's ride the middle
    const aSmall = area(a.box) <= area(b.box);
    const u = aSmall ? p : 1 - p;
    if (skins) {
      // One fill into the other, never both whole: two translucent fills over each other are denser than either
      const o = skins.small ? 1 - smooth(clamp01(u / SKIN_SPAN)) : 0;
      for (const [skin, opacity] of [
        [skins.big, 1 - o],
        [skins.small, o],
      ] as const) {
        if (!skin) continue;
        skin.style.width = px(w);
        skin.style.height = px(h);
        skin.style.opacity = String(Math.round(opacity * 1000) / 1000);
      }
    }
    const ride = (end: End, isSmall: boolean, fade = 1) => {
      const piece = end.layer;
      if (!piece) return;
      if (isSmall) {
        piece.left = end.box.x;
        piece.top = end.box.y;
        piece.s = 1;
        piece.blur = 0;
        piece.o = small(u) * fade;
      } else {
        const m = big(u);
        piece.s = m.s;
        piece.blur = m.blur;
        piece.o = m.o * fade;
        piece.left = x + w / 2 - (piece.w * m.s) / 2;
        piece.top = y + h / 2 - (piece.h * m.s) / 2;
      }
      draw(piece, x, y);
    };
    ride(a, aSmall);
    ride(b, !aSmall);
    const { live } = flight;
    if (live) {
      /*
       * The bigger one itself: centered on the shape, magnified and blurred as it comes in, clipped
       * to it. Its own transform stays, under the morph's: scaled about its corner, its translation
       * would scale too, so the morph's translate takes back what the scale adds to it.
       */
      const { el, piece, base, shift } = live;
      const box = flight[live.end].box;
      const m = big(u);
      const c = m.s;
      const dx = x + w / 2 - box.x - (c * box.width) / 2;
      const dy = y + h / 2 - box.y - (c * box.height) / 2;
      el.style.transform = `translate(${px(dx + (1 - c) * shift.x)}, ${px(dy + (1 - c) * shift.y)}) scale(${Math.round(c * 10000) / 10000})${base}`;
      // The shape's box in its own (untransformed) pixels
      const top = (y - box.y - dy) / c;
      const left = (x - box.x - dx) / c;
      const bottom = box.height - (y + h - box.y - dy) / c;
      const right = box.width - (x + w - box.x - dx) / c;
      el.style.clipPath = `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)} round ${radiiCss(radii, c)})`;
      el.style.opacity = String(Math.round(m.o * 1000) / 1000);
      el.style.filter = m.blur > 0.33 ? `blur(${px(m.blur)})` : "";
      Object.assign(piece, {
        left: box.x + dx,
        top: box.y + dy,
        s: c,
        o: m.o,
        blur: m.blur,
        w: box.width,
        h: box.height,
      });
    }
    // Contents from before it started over fade as `a`'s would, where they are
    const fade = aSmall ? small(u) : big(u).o;
    for (const ghost of flight.ghosts) {
      const o = ghost.o;
      ghost.o = o * fade;
      draw(ghost, x, y);
      ghost.o = o;
    }

    /*
     * Matched pieces go between their spot in the smaller end, where it is in its element, and
     * their spot in the bigger end, held there (to an edge or the middle) in the shape as it is
     * now. How far along they are is how far the shape's size is, not the progress: with the
     * shape the smaller one's size they're right where they belong in it, however early the
     * progress got there, and while the shape holds its size, so do they.
     */
    // The one under (where it goes) comes in while the one over (where it was) is still whole, then
    // the one over goes: two halves of a fade over each other show less than one whole
    const cross = clamp01((p - MATCH_FROM) / MATCH_SPAN);
    const coming = smooth(clamp01(cross * 2));
    const going = 1 - smooth(clamp01(cross * 2 - 1));
    const [smallEnd, bigEnd] = aSmall ? [a, b] : [b, a];
    const share = (now: number, from: number, to: number) =>
      Math.abs(to - from) < 1 ? null : (now - from) / (to - from);
    const grown = [
      share(w, smallEnd.box.width, bigEnd.box.width),
      share(h, smallEnd.box.height, bigEnd.box.height),
    ].filter((v): v is number => v !== null);
    const size = grown.length ? clamp01(grown.reduce((s, v) => s + v, 0) / grown.length) : aSmall ? e : 1 - e;
    for (const { a: pa, b: pb, at } of flight.matches) {
      const [inSmall, inBig] = aSmall ? at : [at[1], at[0]];
      const sw = mix(inSmall.w, inBig.w, size);
      const sh = mix(inSmall.h, inBig.h, size);
      const cx = mix(
        middleOf(inSmall.x, smallEnd.box.x, smallEnd.box.width, inSmall.w),
        middleOf(inBig.x, x, w, inBig.w),
        size,
      );
      const cy = mix(
        middleOf(inSmall.y, smallEnd.box.y, smallEnd.box.height, inSmall.h),
        middleOf(inBig.y, y, h, inBig.h),
        size,
      );
      for (const [piece, o] of [
        [pa, going],
        [pb, coming],
      ] as const) {
        piece.s = Math.sqrt((sw / piece.w) * (sh / piece.h));
        piece.left = cx - (piece.w * piece.s) / 2;
        piece.top = cy - (piece.h * piece.s) / 2;
        piece.o = o;
        piece.blur = 0;
        draw(piece, x, y);
      }
    }

    if (stub && stubBox) {
      // The stub shrinks away in the group as the shape leaves its state, under the lifted shape
      const there = flight.stubAt[0] * (1 - p) + flight.stubAt[1] * p;
      const s = smooth(clamp01((there - (1 - STUB_SPAN)) / STUB_SPAN));
      stub.style.transform = `translate(${px(stubBox.x - stubOrigin.x)}, ${px(stubBox.y - stubOrigin.y)}) scale(${Math.round(s * 10000) / 10000})`;
    }
  };

  let current = initial;
  let motion: SpringAnimator<Channel> | null = null;
  /** Shrinking from rest: the beat the shape holds before it goes */
  let hold = 0;
  /** Whether that beat is still on: the shape stays where it is, only the contents go */
  let holding = false;
  let destroyed = false;

  const at = (box: Box, p: number): Frame => ({
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    w: box.width,
    h: box.height,
    p,
  });
  /** Where the flight is headed, from the boxes as they are now */
  const goal = (): Frame => {
    const { a, b, toward } = flight!;
    return toward === "b" ? { ...at(holding ? a.box : b.box, 1) } : at(a.box, 0);
  };
  /** The springs for the way it heads: growing into a bigger box or shrinking into a smaller one */
  const springs = () => {
    const { a, b, toward } = flight!;
    const [there, here] = toward === "b" ? [b, a] : [a, b];
    return area(there.box) >= area(here.box) ? spring.grow : spring.shrink;
  };

  /** What `to()` handed out for where it's going now */
  let pending: { el: HTMLElement; promise: Promise<boolean>; resolve: (done: boolean) => void } | null = null;
  const promise = (el: HTMLElement) => {
    if (pending?.el === el) return pending.promise;
    pending?.resolve(false);
    let resolve: (done: boolean) => void = () => {};
    const p = new Promise<boolean>((r) => (resolve = r));
    pending = { el, promise: p, resolve };
    return p;
  };

  /** Follows the page under the flight: a scroll, a resize */
  const follows = (on: boolean) => {
    if (on) {
      win.addEventListener("resize", update);
      doc.addEventListener("scroll", update, { capture: true, passive: true });
    } else {
      win.removeEventListener("resize", update);
      doc.removeEventListener("scroll", update, { capture: true });
    }
  };

  /** A flight off from rest, from `from` to `to`: the shape dressed and put in its place */
  const launch = (from: HTMLElement, to: HTMLElement) => {
    const aBox = atRest(from);
    const bBox = atRest(to);
    const [small, big] = area(aBox) <= area(bBox) ? [from, to] : [to, from];
    // The shape lives by the state that's in a group, if one is; else by the smaller one
    anchor = grouped(from) ? from : grouped(to) ? to : small;
    lifted = !!container || covers(anchor, anchor === from ? bBox : aBox);
    const stubbed = lifted && grouped(anchor);
    shape.style.zIndex = lifted ? "1" : "";
    const matches = matchesOf(from, aBox, to, bBox);
    const keys = new Set(matches.map((m) => m.a.node.dataset.lwMatch ?? ""));
    // The smaller one as a copy in the shape; the bigger one flies itself
    const smallBox = small === from ? aBox : bBox;
    const layer = layerOf(small, smallBox, keys);
    flight = {
      a: { el: from, box: aBox, layer: small === from ? layer : null },
      b: { el: to, box: bBox, layer: small === to ? layer : null },
      toward: "b",
      matches,
      ghosts: [],
      stubAt: anchor === from ? [1, 0] : [0, 1],
      live: null,
    };
    // The bigger one's surface the whole way, turned around or not; or both, one into the other
    for (const name of CARRIED) shape.style.removeProperty(name);
    skins = null;
    wear(shape, big);
    shape.replaceChildren(layer.node, ...matches.flatMap((m) => [m.b.node, m.a.node]));
    if (stubbed) {
      stubBox = anchor === from ? aBox : bBox;
      stub = anchor.cloneNode(true) as HTMLElement;
      scrub(stub);
      stub.style.cssText +=
        `; ${PINNED}; transform-origin: 0 0; contain: strict; overflow: hidden; ` +
        `width: ${stubBox.width}px; height: ${stubBox.height}px; opacity: ${saved.get(anchor)!.opacity || 1}`;
    }
    place();
    // Surfaces compared as the copies draw them, in place
    if (!grouped(from) && !grouped(to)) skins = fill(small, big);
    inherit([layer, ...matches.flatMap((m) => [m.a, m.b])]);
    reorigin();
    away(from);
    away(to);
    flight.live = { ...goLive(big, big === from ? aBox : bBox, keys), end: big === from ? "a" : "b" };
    follows(true);
  };

  /**
   * Turned around: the copies taken again, as the states are now (a label changed by a press on the
   * way, a match moved), where the old ones were; the flight goes on as it was
   */
  const redress = () => {
    const f = flight!;
    if (!f.a.el || !f.b.el) return;
    const end = f.a.layer ? f.a : f.b;
    const old = end.layer;
    if (!old || !end.el) return;
    for (const m of f.matches) {
      m.a.node.remove();
      m.b.node.remove();
    }
    f.matches = matchesOf(f.a.el, f.a.box, f.b.el, f.b.box);
    const keys = new Set(f.matches.map((m) => m.a.node.dataset.lwMatch ?? ""));
    const layer = layerOf(end.el, end.box, keys);
    Object.assign(layer, { left: old.left, top: old.top, s: old.s, o: old.o, blur: old.blur });
    old.node.replaceWith(layer.node);
    end.layer = layer;
    shape.append(...f.matches.flatMap((m) => [m.b.node, m.a.node]));
    if (f.live) {
      unhide(f.live.twins);
      f.live.twins = hide(f.live.el, keys);
    }
    inherit([layer, ...f.matches.flatMap((m) => [m.a, m.b])]);
    if (motion) render(motion.values());
  };

  /** Sent elsewhere mid-way: it starts over from where the shape is, what it carried fading there */
  const restart = (to: HTMLElement) => {
    const f = flight!;
    const now = motion!.values();
    const p = clamp01(now.p);
    const box: Box = {
      x: now.cx - now.w / 2,
      y: now.cy - now.h / 2,
      width: now.w,
      height: now.h,
      radii: drawn.radii,
      shape: drawn.shape,
    };
    // The one flying itself lets go: a copy of it fades where it is, with what else was on its way
    const keys = new Set(f.matches.map((m) => m.a.node.dataset.lwMatch ?? ""));
    let grounded: Piece | null = null;
    if (f.live) {
      grounded = layerOf(f.live.el, f[f.live.end].box, keys);
      Object.assign(grounded, {
        left: f.live.piece.left,
        top: f.live.piece.top,
        s: f.live.piece.s,
        o: f.live.piece.o,
        blur: f.live.piece.blur,
      });
      shape.append(grounded.node);
      letGo(f.live);
      away(f.live.el);
    }
    const ghosts = [
      ...f.ghosts,
      ...[f.a.layer, f.b.layer, grounded].filter((piece): piece is Piece => !!piece),
      ...f.matches.flatMap((m) => [m.a, m.b]),
    ].filter((piece) => {
      if (piece.o > 0.01) return true;
      piece.node.remove();
      return false;
    });
    // Where it goes flies itself if it's bigger than the shape is now, else rides in it as a copy
    const bBox = atRest(to);
    const bigger = area(bBox) > area(box);
    const layer = bigger ? null : layerOf(to, bBox, new Set());
    if (layer) shape.append(layer.node);
    flight = {
      a: { el: null, box, layer: null },
      b: { el: to, box: bBox, layer },
      toward: "b",
      matches: [],
      ghosts,
      stubAt: [f.stubAt[0] * (1 - p) + f.stubAt[1] * p, to === anchor ? 1 : 0],
      live: null,
    };
    for (const name of CARRIED) shape.style.removeProperty(name);
    skins?.big.remove();
    skins?.small?.remove();
    skins = null;
    wear(shape, to);
    if (!grouped(to) && !grouped(anchor)) skins = fill(null, to);
    inherit([layer, grounded]);
    away(to);
    if (bigger) flight.live = { ...goLive(to, bBox, new Set()), end: "b" };
    motion!.jump({ p: 0 }, { p: 0 });
  };

  /** At rest as `el`: it's itself again, and the shape and everything in it leave */
  const clear = () => {
    shape.remove();
    shape.replaceChildren();
    skins = null;
  };
  const settle = (el: HTMLElement) => {
    const live = flight?.live;
    const keep = live?.el === el;
    if (live && keep) {
      // Only the surface stays a frame: what rode in the shape is all there in it now
      shape.replaceChildren(...(skins ? [skins.big, ...(skins.small ? [skins.small] : [])] : []));
      letGo(live, clear);
    } else {
      if (live) {
        letGo(live);
        away(live.el);
      }
      clear();
    }
    show(el);
    stub?.remove();
    stub = null;
    stubBox = null;
    flight = null;
    follows(false);
    onRest?.(el);
    const arrived = pending;
    pending = null;
    arrived?.resolve(true);
  };
  const rest = () => {
    motion = null;
    settle(current);
  };

  const to = (el: HTMLElement, { instant = false }: MorphMove = {}) => {
    if (destroyed) return Promise.resolve(false);
    landing?.();
    if (!saved.has(el)) throw new Error("morph: that isn't one of its states");
    if (el === current) {
      if (instant && motion) {
        win.clearTimeout(hold);
        holding = false;
        motion.stop();
        render(goal());
        rest();
      }
      return pending?.promise ?? Promise.resolve(true);
    }
    const from = current;
    current = el;
    const done = promise(el);
    win.clearTimeout(hold);
    holding = false;
    if (instant || reduced.matches) {
      // At once: no shape, the states swap
      motion?.stop();
      motion = null;
      for (const state of states) if (state !== el) away(state);
      onStart?.(el, from);
      settle(el);
      return done;
    }
    const fromRest = !flight;
    if (!flight) launch(from, el);
    else if (flight.a.el === el || flight.b.el === el) {
      // Turned around: back the way it came, keeping its speed, carrying what's there now
      flight.toward = flight.a.el === el ? "a" : "b";
      redress();
    } else restart(el);
    // The one flying itself takes presses on its way in, not on its way out
    if (flight?.live) {
      const { el: live } = flight.live;
      live.style.pointerEvents = live === el ? saved.get(live)!.pointerEvents : "none";
    }
    onStart?.(el, from);
    const set = springs();
    // Shrinking from rest the contents go first: the shape holds a beat where it is, then follows
    if (fromRest && set === spring.shrink) {
      holding = true;
      hold = win.setTimeout(
        () => {
          holding = false;
          if (flight && current === el) motion?.to(goal(), channels(spring.shrink));
        },
        SHRINK_HOLD * spring.shrink.width.duration * 1000,
      );
    }
    if (fromRest) motion = new SpringAnimator(at(flight!.a.box, 0), channels(set), render, rest, PRECISION);
    motion!.to(goal(), channels(set));
    return done;
  };

  /**
   * The boxes read again, and the flight after them, as a correction of the same flight. A scroll
   * that carried the shape along carries the flight with it; states that went elsewhere are headed
   * for where they are now.
   */
  function update() {
    if (destroyed || !flight || !motion) return;
    const before = origin;
    reorigin();
    const dx = origin.x - before.x;
    const dy = origin.y - before.y;
    if (dx || dy) {
      const now = motion.values();
      motion.jump({ cx: now.cx + dx, cy: now.cy + dy });
      for (const ghost of flight.ghosts) {
        ghost.left += dx;
        ghost.top += dy;
      }
      if (!flight.a.el) {
        flight.a.box.x += dx;
        flight.a.box.y += dy;
      }
    }
    for (const end of [flight.a, flight.b]) if (end.el) end.box = atRest(end.el);
    if (flight.live) {
      const { el } = flight.live;
      Object.assign(
        flight.live,
        still(el, () => {
          const transform = win.getComputedStyle(el).transform;
          return { base: transform && transform !== "none" ? ` ${transform}` : "", shift: shiftOf(transform) };
        }),
      );
    }
    if (stubBox) stubBox = atRest(anchor);
    motion.retarget(goal());
  }

  for (const el of states) if (el !== initial) away(el);
  show(initial);

  return {
    get current() {
      return current;
    },
    get moving() {
      return !!motion;
    },
    to,
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      win.clearTimeout(hold);
      landing?.();
      motion?.stop();
      motion = null;
      follows(false);
      shape.removeEventListener("click", forward);
      shape.remove();
      stub?.remove();
      if (flight?.live) ground(flight.live);
      flight = null;
      for (const [el, own] of saved) {
        el.removeAttribute(AWAY);
        Object.assign(el.style, own);
      }
      const left = pending;
      pending = null;
      left?.resolve(false);
    },
  };
}

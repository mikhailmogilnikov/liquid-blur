import {
  blobEdges,
  blobPath,
  meltShapes,
  nearestEdge,
  polygon,
  roundedBox,
  type Blob,
  type Bounds,
  type Edge,
  type Melt,
  type Nearest,
  type Shape,
} from "./blob";
import { AWAY, PART, SURFACE } from "@liquid-web/core";

/**
 * Glass group: the children of `.lb-group` share one piece of glass, which melts between them
 * when they come close, like drops of liquid. Size changes, inline style and class changes of the
 * children and their CSS transitions and animations are picked up on their own: anything that
 * moves them through `style` (a spring, `lb-stretch`, `lb-swell`) or CSS just works. Moved some
 * other way (layout changes from outside the group, a script animating an ancestor's child list),
 * call `update()`. A child with `visibility: hidden` makes no glass, nor one marked `data-lw-away`
 * (a morph's control while its panel is out: invisible, yet still there to focus and read). While
 * it runs the root is marked `data-lw-surface` and its own elements `data-lw-part` (contract.ts).
 *
 * The children are glass themselves (`.lb`), and while none of them melt they stay exactly that:
 * the group draws nothing and costs a few dozen microseconds a frame to watch them. Without the
 * script they're plain glass too. Once two come close enough to grow a neck, the group takes over
 * (`data-lb-melted` on the root): two panes that overlap would blur and fill the overlap twice, so
 * the children's own glass steps aside for one surface drawn behind them:
 *   - backdrop and fill on a single element clipped to the melted outline (`clip-path: path()`),
 *     solved exactly from the children's boxes (blob.ts), and masked to it as well (an inline SVG
 *     `<mask>`): under an ancestor with `overflow: hidden` and `border-radius`, Chromium on Windows
 *     (and wherever it composites the same way) clips the backdrop only to the path's bounding box,
 *     a blurred rectangle around the glass, while the mask holds. Neither holds under an ancestor
 *     that clips with `corner-shape`: Chromium shows the rectangle then, whatever the glass does.
 *   - in it, the volume and glow: a canvas with one pixel per 2px, stretched by the browser on
 *     the GPU and clipped by the glass, so it costs no redraw at full resolution
 *   - rims, edge and drop shadow on one canvas above, clipped to the outline or to the area around
 *     it: plain path clips, no masks, no cut-outs. Drawn at no more than 2x while things move,
 *     at full resolution once they stop.
 *
 * The volume is the box material's own: ends and top and bottom shaded by the distance to the
 * box's sides, so a child that isn't melting looks as it did a moment before as `.lb`. Two things
 * keep that right in a melt. No side counts as nearer than the outline itself, so a side that has
 * melted away inside casts nothing. And around a neck, as it thickens, the shading turns into one
 * that follows the outline: depth below it, weighted by which way the nearest edge faces. A neck
 * appears zero thick, so the switch from the children's glass to the group's shows nothing.
 *
 * Per frame the group reads the children's boxes and nothing else: the material's values, the
 * merge distance and the children's radii and visibility are cached until something that could change them does.
 * It redraws at most once a frame, after every script, and not at all while off screen. The glass
 * element and the canvas grow in steps and shrink lazily, so most frames resize nothing.
 *
 * Everything takes its values from the material's custom properties (the root is `.lb`), so theme,
 * transparency, depth and colors work as on any glass. Children are measured with their
 * transforms, in the root's own pixels: a scaled root or ancestor (even mid-animation) is fine,
 * a rotated one isn't.
 */

/** Distance below which children start to merge, px, unless --lb-merge says otherwise */
const MERGE = 18;
/** Volume grid step, px: at rest, and while things move */
const STEP = 2;
const MOVING_STEP = 3;
/** Volume samples per side of a block that's skipped or painted as a whole */
const BLOCK = 4;
/** Room around the outline for the edge and the drop shadow, px */
const MARGIN = 12;
/** The glass element and the canvas grow this much past what they need, px */
const SLACK = 48;
/** Share of the glow the bottom rim gets, as in the box material */
const GLOW_BOTTOM = 0.6;
/** Resolution of the shade falloff table */
const LUT = 256;
/** How far around a neck the shading follows the outline, in shade reaches */
const MELT_REACH = 2;
/**
 * Drop shadow 0 2px 10px -3px as three stacked strokes: half-widths, px, and the shadow's
 * strength there, a Gaussian (sigma 5) of the outline grown by -3px
 */
const SHADOW_BANDS: [number, number][] = [
  [2, 0.27],
  [4.5, 0.16],
  [8, 0.08],
];

export type GlassGroup = {
  /** Re-measure the children and redraw */
  update(): void;
  destroy(): void;
};

type RGB = [number, number, number];

/** The material's resolved values, read from a probe inside the group */
type Look = {
  ends: number;
  rows: number;
  reach: number;
  rowsReach: number;
  focus: number;
  glow: number;
  glowSize: number;
  rimTop: number;
  rimBottom: number;
  edge: number;
  shadow: number;
  hair: number;
  shade: RGB;
  shine: RGB;
  /** The system's text color: the only line drawn in forced colors */
  ink: RGB;
};

/**
 * One element resolves the material's values through properties that compute calc() to a plain
 * length: amounts are scaled by 1000px and read back. Colors come back as colors.
 */
const PROBE =
  "position: absolute; visibility: hidden; pointer-events: none; box-sizing: content-box; " +
  "width: calc(var(--_a) * 1000px); height: calc(var(--_v) * 1000px); " +
  "padding: var(--_s) var(--_sv) var(--_lb-glow-size) calc(var(--_p) * 1000px); " +
  "margin: calc(min(1, var(--_g)) * 1000px) calc(min(1, var(--_lb-rim-top) * var(--_k)) * 1000px) " +
  "calc(min(1, var(--_lb-rim-bottom) * var(--_k)) * 1000px) calc(var(--_lb-edge) * 1000px); " +
  "text-indent: calc(var(--_lb-shadow) * 1000px); letter-spacing: var(--_lb-hair); " +
  "color: var(--lb-shade-color); background-color: var(--lb-shine-color); border-left-color: CanvasText";

function rgb(color: string): RGB {
  const [r = 0, g = 0, b = 0] = color.match(/[\d.]+/g)?.map(Number) ?? [];
  // color(srgb 0..1 ...) or rgb(0..255 ...)
  return color.startsWith("color(") ? [r * 255, g * 255, b * 255] : [r, g, b];
}

function readLook(probe: HTMLElement): Look {
  const s = (probe.ownerDocument.defaultView ?? window).getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  return {
    ends: px(s.width) / 1000,
    rows: px(s.height) / 1000,
    reach: px(s.paddingTop) || 1,
    rowsReach: px(s.paddingRight) || 1,
    glowSize: px(s.paddingBottom) || 1,
    focus: px(s.paddingLeft) / 1000 || 2,
    glow: px(s.marginTop) / 1000,
    rimTop: px(s.marginRight) / 1000,
    rimBottom: px(s.marginBottom) / 1000,
    edge: px(s.marginLeft) / 1000,
    shadow: px(s.textIndent) / 1000,
    hair: px(s.letterSpacing) || 0.5,
    shade: rgb(s.color),
    shine: rgb(s.backgroundColor),
    ink: rgb(s.borderLeftColor),
  };
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${Math.min(1, Math.max(0, a))})`;

/** (1 - t)^p for t = 0..1 in LUT steps */
function falloffTable(p: number) {
  const table = new Float32Array(LUT + 1);
  for (let i = 0; i <= LUT; i++) table[i] = (1 - i / LUT) ** p;
  return table;
}

/** The grid the volume is sampled on: (x0 + i * step, y0 + j * step) */
type Grid = { x0: number; y0: number; cols: number; rows: number; step: number };

const coreBounds = ({ core }: Melt): Bounds => {
  const xs = core.map((p) => p[0]);
  const ys = core.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/**
 * Volume and glow, one pixel per sample, over the grid's blocks that cover `region`.
 *
 * As the box material: the ends shaded by the distance to the nearest of the box's left and right
 * sides, top and bottom by the distance to theirs, alpha * (1 - t)^p each; a linear glow under the
 * top and (weaker) the bottom. The box is the child's the sample is deepest in. No side counts as
 * nearer than the outline: a side that melted away inside sits deeper than that.
 *
 * Around a neck, as it thickens, this turns into the same falloffs following the outline: depth
 * below its nearest edge, weighted by n.x² (ends) and n.y² (top and bottom), where n is that
 * edge's outward normal. Inside a neck, outside every box, that's all there is.
 *
 * Outside the outline counts as on it: the clip cuts it, and the pixels along the edge stay whole.
 */
function paintVolume(
  image: ImageData,
  blob: Blob,
  edges: Edge[],
  grid: Grid,
  region: Bounds,
  look: Look,
  table: Float32Array,
) {
  const { x0, y0, cols, rows, step } = grid;
  const stride = cols + 1;
  const data = image.data;
  data.fill(0);
  const i0 = Math.max(0, Math.floor((region.x - x0) / step / BLOCK) * BLOCK);
  const j0 = Math.max(0, Math.floor((region.y - y0) / step / BLOCK) * BLOCK);
  const i1 = Math.min(cols, Math.ceil((region.x + region.width - x0) / step));
  const j1 = Math.min(rows, Math.ceil((region.y + region.height - y0) / step));

  const far = Math.max(look.reach, look.rowsReach, look.glowSize);
  const meltReach = MELT_REACH * look.reach;
  const [sr, sg, sb] = look.shade;
  const [gr, gg, gb] = look.shine;
  const meltBounds = blob.melts.map(coreBounds);
  const nearest: Nearest = { d: 0, nx: 0, ny: 0, inside: false };
  const fall = (d: number, reach: number) => (d < reach ? table[((d / reach) * LUT) | 0] : 0);
  /** How far melted a point is: the strongest neck's strength, fading out with distance from its heart */
  const meltAt = (list: Melt[], x: number, y: number) => {
    let melt = 0;
    for (let k = 0; k < list.length; k++) {
      const d = polygon(x, y, list[k].core);
      const m = list[k].strength * (d <= 0 ? 1 : d < meltReach ? 1 - d / meltReach : 0);
      if (m > melt) melt = m;
    }
    return melt;
  };

  // A block's samples are all within this of its center
  const spread = (BLOCK * step) / Math.SQRT2;
  /*
   * Anything further than this from a block's center doesn't matter to any of its samples: an edge
   * beyond the shading's reach leaves a sample unshaded, a neck beyond its own reach unmelted
   */
  const edgeReach = far + 2 * spread + 2 * step;
  const reach = Math.max(far, meltReach) + 2 * spread + 2 * step;
  const within = (b: Bounds, x: number, y: number, r: number) =>
    x > b.x - r && x < b.x + b.width + r && y > b.y - r && y < b.y + b.height + r;
  const near = (b: Bounds, x: number, y: number) => within(b, x, y, reach);

  // What's near the current block, refilled per block rather than reallocated: no garbage per frame
  const local: Edge[] = [];
  const shapes: Shape[] = [];
  const melts: Melt[] = [];
  for (let bj = j0; bj <= j1; bj += BLOCK) {
    for (let bi = i0; bi <= i1; bi += BLOCK) {
      const cx = x0 + (bi + BLOCK / 2) * step;
      const cy = y0 + (bj + BLOCK / 2) * step;
      local.length = 0;
      for (let k = 0; k < edges.length; k++) if (within(edges[k], cx, cy, edgeReach)) local.push(edges[k]);
      // No edge in reach: deeper than any light or shade, or far outside
      if (!local.length) continue;
      nearestEdge(local, cx, cy, nearest);
      if (nearest.d > far + spread) continue;
      shapes.length = 0;
      for (let k = 0; k < blob.shapes.length; k++) if (near(blob.shapes[k], cx, cy)) shapes.push(blob.shapes[k]);
      melts.length = 0;
      for (let k = 0; k < blob.melts.length; k++) if (near(meltBounds[k], cx, cy)) melts.push(blob.melts[k]);
      // How melted, at the block's corners; it changes slowly, so in between it's interpolated
      const left = x0 + bi * step;
      const top = y0 + bj * step;
      const side = BLOCK * step;
      const m00 = meltAt(melts, left, top);
      const m10 = meltAt(melts, left + side, top);
      const m01 = meltAt(melts, left, top + side);
      const m11 = meltAt(melts, left + side, top + side);
      const anyMelt = m00 + m10 + m01 + m11 > 0;

      for (let j = bj; j < Math.min(bj + BLOCK, rows + 1); j++) {
        for (let i = bi; i < Math.min(bi + BLOCK, cols + 1); i++) {
          const px = x0 + i * step;
          const py = y0 + j * step;
          nearestEdge(local, px, py, nearest);
          if (nearest.d >= far) continue;
          if (!nearest.inside && nearest.d > step * 1.5) continue;
          const depth = nearest.inside ? nearest.d : 0;

          // Following the outline
          const wx = nearest.nx * nearest.nx;
          const wy = nearest.ny * nearest.ny;
          const endsO = look.ends * wx * fall(depth, look.reach);
          const rowsO = look.rows * wy * fall(depth, look.rowsReach);
          let shade = 1 - (1 - endsO) * (1 - rowsO);
          let glow =
            depth < look.glowSize
              ? look.glow * wy * (nearest.ny < 0 ? 1 : GLOW_BOTTOM) * (1 - depth / look.glowSize)
              : 0;

          // The box's, from the child the sample is deepest in
          let box: Shape | null = null;
          let deepest = Infinity;
          for (let k = 0; k < shapes.length; k++) {
            const d = roundedBox(px, py, shapes[k]);
            if (d < deepest) {
              deepest = d;
              box = shapes[k];
            }
          }
          // In a neck, outside every box, there's only the outline's
          if (box && !(deepest > 0 && nearest.inside)) {
            let melt = 0;
            if (anyMelt) {
              const u = (i - bi) / BLOCK;
              const v = (j - bj) / BLOCK;
              melt = (m00 * (1 - u) + m10 * u) * (1 - v) + (m01 * (1 - u) + m11 * u) * v;
            }
            if (melt < 1) {
              const left = px - box.x;
              const right = box.x + box.width - px;
              const top = py - box.y;
              const bottom = box.y + box.height - py;
              const ex = Math.max(Math.min(left, right), depth);
              const ey = Math.max(Math.min(top, bottom), depth);
              const ends = ex < box.width / 2 ? look.ends * fall(ex, look.reach) : 0;
              const rowsB = ey < box.height / 2 ? look.rows * fall(ey, look.rowsReach) : 0;
              const shadeB = 1 - (1 - ends) * (1 - rowsB);
              const gt = Math.max(top, depth);
              const gb = Math.max(bottom, depth);
              const glowB =
                gt < look.glowSize
                  ? look.glow * (1 - gt / look.glowSize)
                  : gb < look.glowSize
                    ? look.glow * GLOW_BOTTOM * (1 - gb / look.glowSize)
                    : 0;
              shade = shadeB + (shade - shadeB) * melt;
              glow = glowB + (glow - glowB) * melt;
            }
          }

          // Glow over shade
          const alpha = glow + shade * (1 - glow);
          if (alpha <= 0) continue;
          const under = (shade * (1 - glow)) / alpha;
          const over = glow / alpha;
          const o = (j * stride + i) * 4;
          data[o] = sr * under + gr * over;
          data[o + 1] = sg * under + gg * over;
          data[o + 2] = sb * under + gb * over;
          data[o + 3] = alpha * 255;
        }
      }
    }
  }
}

const contains = (outer: Bounds, inner: Bounds) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** One group per root: creating another for it returns the first */
const groups = new WeakMap<HTMLElement, GlassGroup>();
const SVG = "http://www.w3.org/2000/svg";
/** Masks made so far, for unique ids */
let masks = 0;

export function createGlassGroup(root: HTMLElement): GlassGroup {
  const existing = groups.get(root);
  if (existing) return existing;
  // Only what we add comes off again on destroy: `lb-group` written in the markup stays
  const added = ["lb", "lb-group"].filter((name) => !root.classList.contains(name));
  root.classList.add(...added);
  root.setAttribute(SURFACE, "");
  // The root's own document and window: it may live in an iframe
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;

  const glass = doc.createElement("div");
  glass.className = "lb-group__glass";
  glass.setAttribute("aria-hidden", "true");
  glass.setAttribute(PART, "");
  const probe = doc.createElement("span");
  probe.style.cssText = PROBE;
  // Resized to ask for a redraw in the frame's resize-observer step: see `schedule`
  const pulse = doc.createElement("span");
  pulse.style.cssText = "position: absolute; width: 0; height: 0; visibility: hidden; pointer-events: none";
  /*
   * The volume: one pixel per grid sample, stretched by the browser (on the GPU, not in a canvas
   * redraw) and clipped by the glass it sits in
   */
  const volume = doc.createElement("canvas");
  volume.className = "lb-group__volume";
  /*
   * The outline the glass is masked to, on top of its clip-path. Two masks taking turns: the glass
   * switches to the other one with each new outline, as browsers may keep painting a mask whose
   * path alone changed. In the glass's box units, scaled from its pixels, so CSS zoom can't put
   * the outline off the way user space would in WebKit.
   */
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none";
  const id = `lb-group-mask-${++masks}`;
  const outlines = [0, 1].map((n) => {
    const mask = doc.createElementNS(SVG, "mask");
    mask.id = `${id}-${n}`;
    mask.setAttribute("maskContentUnits", "objectBoundingBox");
    const path = doc.createElementNS(SVG, "path");
    path.setAttribute("fill", "white");
    mask.append(path);
    svg.append(mask);
    return path;
  });
  let turn = 0;
  let outlineKey = "";
  glass.append(probe, pulse, svg, volume);
  const paint = doc.createElement("canvas");
  paint.className = "lb-group__paint";
  paint.setAttribute("aria-hidden", "true");
  paint.setAttribute(PART, "");
  root.prepend(glass, paint);

  const context = paint.getContext("2d");
  const volumeContext = volume.getContext("2d");

  const items = () =>
    [...root.children].filter((el): el is HTMLElement => el !== glass && el !== paint && el instanceof HTMLElement);

  // Cached until something that could change them does
  let look: Look | null = null;
  let table: Float32Array | null = null;
  let merge: number | null = null;
  /** Each child's radius and whether it's hidden: read once, again after its style or size changes */
  const traits = new WeakMap<Element, { radius: number; hidden: boolean }>();

  /** Where the glass element and the canvas are, in the root's coordinates, and the canvas's scale */
  let frameBox: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  let dpr = 0;
  let grid: Grid = { x0: 0, y0: 0, cols: 0, rows: 0, step: STEP };
  let image: ImageData | null = null;
  /** The canvas area drawn last frame, in device pixels: only it needs clearing */
  let dirty = { x: 0, y: 0, width: 0, height: 0 };

  /** The volume's grid over the frame, at this step */
  const regrid = (step: number) => {
    grid = {
      x0: frameBox.x,
      y0: frameBox.y,
      cols: Math.ceil(frameBox.width / step),
      rows: Math.ceil(frameBox.height / step),
      step,
    };
    volume.width = grid.cols + 1;
    volume.height = grid.rows + 1;
    // Each pixel centered on its sample
    volume.style.left = `${-step / 2}px`;
    volume.style.top = `${-step / 2}px`;
    volume.style.width = `${volume.width * step}px`;
    volume.style.height = `${volume.height * step}px`;
    image = volumeContext?.createImageData(volume.width, volume.height) ?? null;
  };
  const rescale = (scale: number) => {
    dpr = scale;
    paint.width = Math.ceil(frameBox.width * dpr);
    paint.height = Math.ceil(frameBox.height * dpr);
    dirty = { x: 0, y: 0, width: 0, height: 0 };
  };

  /**
   * Moves and sizes the glass and the canvases when `want` outgrows them; sets the canvas's scale
   * and the volume's grid step
   */
  const place = (want: Bounds, scale: number, step: number) => {
    if (contains(frameBox, want) && frameBox.width * frameBox.height <= 4 * Math.max(1, want.width * want.height)) {
      if (scale !== dpr) rescale(scale);
      if (step !== grid.step) regrid(step);
      return;
    }
    frameBox = {
      x: Math.floor(want.x - SLACK),
      y: Math.floor(want.y - SLACK),
      width: Math.ceil(want.width + 2 * SLACK),
      height: Math.ceil(want.height + 2 * SLACK),
    };
    for (const el of [glass, paint]) {
      el.style.left = `${frameBox.x}px`;
      el.style.top = `${frameBox.y}px`;
      el.style.width = `${frameBox.width}px`;
      el.style.height = `${frameBox.height}px`;
    }
    rescale(scale);
    regrid(step);
  };

  /*
   * CSS transitions and animations of the children move them without touching their style
   * attribute: follow them every frame until none runs. Checked on creation (an animation may have
   * started before the script ran, and an infinite one sends no further start), on their events
   * and on coming back on screen. The events bubble from deeper too; those cost a frame's check,
   * then the loop stops. Off screen the loop stops as well.
   */
  let follow = 0;
  const running = () => items().some((el) => el.getAnimations?.().some((a) => a.pending || a.playState === "running"));
  const followFrame = () => {
    follow = 0;
    if (!visible) return;
    schedule();
    if (running()) follow = win.requestAnimationFrame(followFrame);
  };
  const animate = () => {
    if (!follow) follow = win.requestAnimationFrame(followFrame);
  };
  const animationEvents = [
    "transitionrun",
    "transitionend",
    "transitioncancel",
    "animationstart",
    "animationiteration",
    "animationend",
    "animationcancel",
  ];
  for (const type of animationEvents) root.addEventListener(type, animate);

  /*
   * While things move, rims, edge and shadow are drawn at no more than 2x (at 3x that's more than
   * twice the pixels) and the volume on a coarser grid: in motion neither shows. Once still, both
   * are drawn again in full.
   */
  let lastDraw = 0;
  let settle = 0;
  const inMotion = () => {
    const now = performance.now();
    const moving = now - lastDraw < 100;
    lastDraw = now;
    win.clearTimeout(settle);
    if (moving) {
      settle = win.setTimeout(() => {
        lastDraw = 0;
        drawn = "";
        schedule();
      }, 150);
    }
    return moving;
  };

  let visible = true;
  let melted = false;
  /** What the last frame was drawn from; the same again draws nothing */
  let drawn = "";

  const setMelted = (on: boolean) => {
    if (on === melted) return;
    melted = on;
    root.toggleAttribute("data-lb-melted", on);
  };

  const update = () => {
    pending = false;
    if (!visible) {
      drawn = "";
      return;
    }
    const forced = forcedColors.matches;

    if (merge === null) {
      const value = parseFloat(win.getComputedStyle(root).getPropertyValue("--lb-merge"));
      merge = Number.isFinite(value) ? value : MERGE;
    }
    if (!look) {
      look = readLook(probe);
      table = falloffTable(look.focus);
    }

    /*
     * Boxes on screen carry every transform above them: an ancestor scaled by an animation (or the
     * root itself) would put the outline off by that scale, drawn in the root's own pixels. So
     * everything is measured in those pixels: screen distances divided by the root's scale on
     * screen. Rounded to a hundredth of a pixel, so the division's noise doesn't count as a move.
     */
    const origin = root.getBoundingClientRect();
    const sx = root.offsetWidth && origin.width ? origin.width / root.offsetWidth : 1;
    const sy = root.offsetHeight && origin.height ? origin.height / root.offsetHeight : 1;
    const local = (v: number, s: number) => Math.round((v / s) * 100) / 100;
    const shapes: Shape[] = [];
    let glassy = true;
    for (const el of items()) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      let trait = traits.get(el);
      if (!trait) {
        const style = win.getComputedStyle(el);
        trait = {
          radius: parseFloat(style.borderTopLeftRadius) || 0,
          hidden: style.visibility === "hidden" || el.hasAttribute(AWAY),
        };
        traits.set(el, trait);
      }
      if (trait.hidden) continue;
      glassy &&= el.classList.contains("lb");
      const { radius } = trait;
      const width = local(box.width, sx);
      // A scaled child keeps its radius in proportion
      const scale = el.offsetWidth ? width / el.offsetWidth : 1;
      shapes.push({
        x: local(box.left - origin.left, sx) - root.clientLeft,
        y: local(box.top - origin.top, sy) - root.clientTop,
        width,
        height: local(box.height, sy),
        radius: local(radius * scale, 1),
      });
    }

    const key = `${forced}|${merge}|${win.devicePixelRatio}|${shapes.map((s) => `${s.x},${s.y},${s.width},${s.height},${s.radius}`).join(";")}`;
    if (key === drawn) return;
    drawn = key;

    const blob = meltShapes(shapes, merge);
    // Nothing melts, nothing overlaps: the children are glass on their own. Children that aren't
    // glass themselves have the group draw for them always.
    const apart = glassy && !blob.necks.length && blob.loops?.length === shapes.length;
    if (apart) {
      setMelted(false);
      return;
    }
    if (!melted) {
      // Coming back from apart: whatever the canvas held is stale
      context?.clearRect(0, 0, paint.width, paint.height);
      dirty = { x: 0, y: 0, width: 0, height: 0 };
    }
    setMelted(true);

    const moving = inMotion();
    const b = blob.bounds;
    const want = { x: b.x - MARGIN, y: b.y - MARGIN, width: b.width + 2 * MARGIN, height: b.height + 2 * MARGIN };
    place(
      want,
      moving ? Math.min(2, win.devicePixelRatio || 1) : win.devicePixelRatio || 1,
      moving ? MOVING_STEP : STEP,
    );
    const d = blobPath(blob, frameBox.x, frameBox.y);
    // The mask's scale goes with the glass's size, which may change while the path doesn't
    const shape = `${d} ${frameBox.width} ${frameBox.height}`;
    if (shape !== outlineKey) {
      outlineKey = shape;
      turn = 1 - turn;
      const outline = outlines[turn]!;
      outline.setAttribute("d", d);
      outline.setAttribute("transform", `scale(${1 / frameBox.width} ${1 / frameBox.height})`);
      glass.style.clipPath = `path("${d}")`;
      glass.style.mask = `url(#${id}-${turn})`;
    }

    if (context) {
      // What this frame draws, in device pixels; the canvas around it is slack
      const x0 = Math.max(0, Math.floor((want.x - frameBox.x) * dpr));
      const y0 = Math.max(0, Math.floor((want.y - frameBox.y) * dpr));
      const area = {
        x: x0,
        y: y0,
        width: Math.min(paint.width, Math.ceil((want.x + want.width - frameBox.x) * dpr)) - x0,
        height: Math.min(paint.height, Math.ceil((want.y + want.height - frameBox.y) * dpr)) - y0,
      };
      // Last frame's drawing and this one's place
      const clearX = Math.min(dirty.x, area.x);
      const clearY = Math.min(dirty.y, area.y);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(
        clearX,
        clearY,
        Math.max(dirty.x + dirty.width, area.x + area.width) - clearX,
        Math.max(dirty.y + dirty.height, area.y + area.height) - clearY,
      );
      dirty = area;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The drawing area in the canvas's own CSS pixels
      const ax = want.x - frameBox.x;
      const ay = want.y - frameBox.y;

      const shape = new Path2D(d);
      /*
       * The outline has no inner edges (unless it failed to close, see blob.ts, then rims, edge and
       * shadow sit that frame out), so evenodd combinations of it are exact. Everything outside it is
       * the drawing area minus it: clip masks cost by their size, so not the whole canvas.
       */
      const clean = blob.loops !== null;
      const outside = new Path2D(`M${ax} ${ay}h${want.width}v${want.height}h${-want.width}Z${d}`);

      if (forced) {
        // Canvases keep their colors in forced colors: no shading, only an outline in the system's
        // text color, 1px inside the shape like the box material's
        context.save();
        context.clip(shape, clean ? "evenodd" : "nonzero");
        context.lineWidth = 2;
        context.strokeStyle = rgba(look.ink, 1);
        context.stroke(shape);
        context.restore();
        return;
      }

      context.save();
      context.clip(shape, clean ? "evenodd" : "nonzero");
      if (image && volumeContext && table) {
        paintVolume(image, blob, blobEdges(blob), grid, want, look, table);
        volumeContext.putImageData(image, 0, 0);
      }
      if (clean) {
        /*
         * Rims: the outline and itself shifted down (the top one) or up (the bottom one), filled
         * evenodd, is the strip between them; inside the clip, only the strip inside the outline.
         */
        for (const [shift, alpha] of [
          [look.hair, look.rimTop],
          [-look.hair, look.rimBottom],
        ]) {
          context.fillStyle = rgba(look.shine, alpha);
          context.fill(new Path2D(d + blobPath(blob, frameBox.x, frameBox.y - shift)), "evenodd");
        }
      }
      context.restore();

      if (clean) {
        context.save();
        context.clip(outside, "evenodd");
        if (look.shadow > 0) {
          context.save();
          context.translate(0, 2);
          // Widest first; each band adds only what the narrower ones inside it don't
          for (let k = SHADOW_BANDS.length - 1; k >= 0; k--) {
            const [half, strength] = SHADOW_BANDS[k];
            const next = SHADOW_BANDS[k + 1]?.[1] ?? 0;
            context.lineWidth = half * 2;
            context.strokeStyle = rgba(look.shade, 1 - (1 - look.shadow * strength) / (1 - look.shadow * next));
            context.stroke(shape);
          }
          context.restore();
        }
        context.lineWidth = look.hair * 2;
        context.strokeStyle = rgba(look.shade, look.edge);
        context.stroke(shape);
        context.restore();
      }
    }
  };

  /*
   * One redraw per frame, after every script that moved something and before the frame is painted.
   * A frame runs its animation callbacks first and its resize observations after them, so asking
   * by resizing an observed element lands the redraw after all of them: two springs on one child
   * (a swell and a stretch settling together) cost one redraw, not one each.
   */
  let pending = false;
  /** The pulse's width as the observer last saw it; asking always moves away from it */
  let seen = 0;
  const tick = new ResizeObserver((entries) => {
    seen = entries[entries.length - 1].contentRect.width;
    if (pending) update();
  });
  tick.observe(pulse);
  const schedule = () => {
    pending = true;
    pulse.style.width = seen ? "0px" : "1px";
  };
  const restyle = () => {
    look = null;
    drawn = "";
    schedule();
  };

  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) traits.delete(entry.target);
    schedule();
  });
  // A child's inline style or class changed (its radius or visibility may have too): redraw in this frame
  const moves = new MutationObserver((records) => {
    for (const r of records) traits.delete(r.target as Element);
    schedule();
  });
  const observe = () => {
    resize.disconnect();
    moves.disconnect();
    resize.observe(root);
    for (const el of items()) {
      resize.observe(el);
      moves.observe(el, { attributes: true, attributeFilter: ["style", "class", AWAY] });
    }
  };
  // Children come and go; the root's own style may carry the merge distance, theme or material
  const mutations = new MutationObserver((records) => {
    if (records.some((r) => r.type === "childList")) observe();
    if (records.some((r) => r.type === "attributes")) {
      merge = null;
      look = null;
      drawn = "";
    }
    schedule();
  });
  mutations.observe(root, { childList: true, attributes: true, attributeFilter: ["style", "class", "data-theme"] });
  /*
   * The canvas bakes the material's colors: repaint when a theme switch may have changed them, on
   * <html> or from the system. A theme set elsewhere needs an update() call.
   */
  const themes = new MutationObserver(restyle);
  themes.observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  const forcedColors = win.matchMedia("(forced-colors: active)");
  const media = [
    forcedColors,
    ...["(prefers-color-scheme: dark)", "(prefers-contrast: more)", "(prefers-reduced-transparency: reduce)"].map((q) =>
      win.matchMedia(q),
    ),
  ];
  for (const m of media) m.addEventListener("change", restyle);
  // Off screen, nothing is drawn; coming back, everything is
  const sight = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) return;
      restyle();
      animate();
    },
    { rootMargin: `${SLACK}px` },
  );
  sight.observe(root);
  observe();
  update();
  animate();

  const group: GlassGroup = {
    update,
    destroy() {
      groups.delete(root);
      win.clearTimeout(settle);
      win.cancelAnimationFrame(follow);
      for (const type of animationEvents) root.removeEventListener(type, animate);
      tick.disconnect();
      sight.disconnect();
      resize.disconnect();
      mutations.disconnect();
      moves.disconnect();
      themes.disconnect();
      for (const m of media) m.removeEventListener("change", restyle);
      glass.remove();
      paint.remove();
      root.removeAttribute("data-lb-melted");
      root.removeAttribute(SURFACE);
      root.classList.remove(...added);
    },
  };
  groups.set(root, group);
  return group;
}

const installed = new WeakMap<Document, () => void>();

/**
 * Makes every `.lb-group` in the document a glass group, including ones mounted later, and lets
 * go of a group once its root leaves the document or loses the class. Installing twice returns the
 * first install. Without a DOM (server rendering) it does nothing. Returns a cleanup function that
 * stops watching and destroys the groups it made.
 */
export function installGlassGroups(root?: Document): () => void {
  root ??= typeof document === "undefined" ? undefined : document;
  if (!root?.defaultView) return () => {};
  const doc: Document = root;
  const existing = installed.get(doc);
  if (existing) return existing;

  const made = new Map<HTMLElement, GlassGroup>();
  let queued = false;
  const sync = () => {
    queued = false;
    for (const [el, group] of made) {
      if (el.isConnected && el.classList.contains("lb-group")) continue;
      made.delete(el);
      group.destroy();
    }
    for (const el of doc.querySelectorAll<HTMLElement>(".lb-group")) {
      if (!made.has(el)) made.set(el, createGlassGroup(el));
    }
  };
  // Batched per task: a framework mounting a tree causes one scan, not one per node
  const watch = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  });
  watch.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  sync();

  const uninstall = () => {
    watch.disconnect();
    installed.delete(doc);
    for (const group of made.values()) group.destroy();
    made.clear();
  };
  installed.set(doc, uninstall);
  return uninstall;
}

/**
 * Rounded rectangles melted together, solved exactly: no sampling, no tracing. Pure geometry, no
 * DOM: shapes in, a path and a distance function out.
 *
 * Two shapes closer than twice the fillet radius ρ get a neck: the morphological closing of the
 * pair, as if a ball of radius ρ rolled around them. Where it can't fit between them it leaves an
 * arc of radius ρ tangent to both, so the neck is concave, thins as they part and snaps at 2ρ.
 * A closing never reaches past the shapes' convex hull: two capsules in a row stay as tall as they
 * are. The arcs' centers are where the shapes grown by ρ cross, which for rounded rectangles is
 * lines meeting circles: a few dozen exact tests per pair.
 *
 * Necks are loops wound clockwise, overlapping the shapes on purpose (inside them), which keeps
 * their own edges away from the outline; they make the distance function. The path is the union's
 * actual outline: shape outlines cut where fillets touch them and other shapes cross them, the
 * inner pieces dropped, the rest joined with the fillet arcs. A path with no inner edges is what
 * strokes and cut-outs along it need: overlapping pieces leave faint seams under antialiasing.
 */

export type Shape = { x: number; y: number; width: number; height: number; radius: number };
export type Point = [number, number];
export type Bounds = { x: number; y: number; width: number; height: number };

/** An arc of radius r around (x, y) */
type Arc = { x: number; y: number; r: number };
/** A closed loop: edge i runs from vertex i to i + 1, along `arcs[i]` if set, else straight */
export type Loop = { points: Point[]; arcs: (Arc | null)[] };
export type Blob = {
  shapes: Shape[];
  necks: Loop[];
  /** One per neck */
  melts: Melt[];
  bounds: Bounds;
  tracks: Track[];
  /** The union's outline; null only if no loop of it closes */
  loops: OutlinePiece[][] | null;
};

const EPS = 1e-6;

type ArcPiece = { kind: "arc"; x: number; y: number; r: number; sx: number; sy: number };
/** Outline pieces of a rounded rectangle grown by `grow`: four axis-aligned sides, four quarter arcs */
type Piece =
  | { kind: "h"; y: number; x0: number; x1: number }
  | { kind: "v"; x: number; y0: number; y1: number }
  | ArcPiece;

function pieces(s: Shape, grow: number): Piece[] {
  const l = s.x + s.radius;
  const t = s.y + s.radius;
  const rr = s.x + s.width - s.radius;
  const b = s.y + s.height - s.radius;
  const r = s.radius + grow;
  const out: Piece[] = [
    { kind: "h", y: t - r, x0: l, x1: rr },
    { kind: "h", y: b + r, x0: l, x1: rr },
    { kind: "v", x: l - r, y0: t, y1: b },
    { kind: "v", x: rr + r, y0: t, y1: b },
  ];
  if (r > EPS) {
    out.push(
      { kind: "arc", x: l, y: t, r, sx: -1, sy: -1 },
      { kind: "arc", x: rr, y: t, r, sx: 1, sy: -1 },
      { kind: "arc", x: rr, y: b, r, sx: 1, sy: 1 },
      { kind: "arc", x: l, y: b, r, sx: -1, sy: 1 },
    );
  }
  return out;
}

const onArc = (a: ArcPiece, x: number, y: number) => (x - a.x) * a.sx >= -EPS && (y - a.y) * a.sy >= -EPS;

/** Where the line x = c (vertical) or y = c, between lo and hi, meets an arc */
function lineArc(vertical: boolean, c: number, lo: number, hi: number, a: ArcPiece, out: Point[]) {
  const d = c - (vertical ? a.x : a.y);
  if (Math.abs(d) > a.r + EPS) return;
  const h = Math.sqrt(Math.max(0, a.r * a.r - d * d));
  for (const sign of [-1, 1]) {
    const along = (vertical ? a.y : a.x) + sign * h;
    if (along < lo - EPS || along > hi + EPS) continue;
    const p: Point = vertical ? [c, along] : [along, c];
    if (onArc(a, p[0], p[1])) out.push(p);
  }
}

function cross(p: Piece, q: Piece, out: Point[]): void {
  if (p.kind === "arc" && q.kind !== "arc") return cross(q, p, out);
  if (p.kind === "v" && q.kind === "h") return cross(q, p, out);
  if (p.kind === "h" && q.kind === "v") {
    if (q.x >= p.x0 - EPS && q.x <= p.x1 + EPS && p.y >= q.y0 - EPS && p.y <= q.y1 + EPS) out.push([q.x, p.y]);
  } else if (p.kind === "h" && q.kind === "arc") {
    lineArc(false, p.y, p.x0, p.x1, q, out);
  } else if (p.kind === "v" && q.kind === "arc") {
    lineArc(true, p.x, p.y0, p.y1, q, out);
  } else if (p.kind === "arc" && q.kind === "arc") {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < EPS || d > p.r + q.r + EPS || d < Math.abs(p.r - q.r) - EPS) return;
    const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
    const mx = p.x + (dx * a) / d;
    const my = p.y + (dy * a) / d;
    for (const sign of [-1, 1]) {
      const x = mx - (sign * dy * h) / d;
      const y = my + (sign * dx * h) / d;
      if (onArc(p, x, y) && onArc(q, x, y)) out.push([x, y]);
    }
  }
  // Parallel sides never cross; collinear ones meet flat and need no fillet
}

/** Points where the outlines of two rounded rectangles, each grown by `grow`, cross */
function crossings(a: Shape, b: Shape, grow: number): Point[] {
  const found: Point[] = [];
  const pb = pieces(b, grow);
  for (const p of pieces(a, grow)) for (const q of pb) cross(p, q, found);
  // A crossing on the joint between two pieces is found twice
  const out: Point[] = [];
  for (const p of found) {
    if (!out.some((q) => Math.abs(q[0] - p[0]) < 1e-4 && Math.abs(q[1] - p[1]) < 1e-4)) out.push(p);
  }
  return out;
}

/** Nearest point on a rounded rectangle's outline, from outside it */
function closest(s: Shape, x: number, y: number): Point {
  const mx = Math.min(Math.max(x, s.x + s.radius), s.x + s.width - s.radius);
  const my = Math.min(Math.max(y, s.y + s.radius), s.y + s.height - s.radius);
  const d = Math.hypot(x - mx, y - my) || 1;
  return [mx + ((x - mx) / d) * s.radius, my + ((y - my) / d) * s.radius];
}

const center = (s: Shape): Point => [s.x + s.width / 2, s.y + s.height / 2];

/** Signed area, positive when wound clockwise on screen */
function area(points: Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

function clockwise(loop: Loop): Loop {
  if (area(loop.points) >= 0) return loop;
  const n = loop.points.length;
  // Reversed, edge k runs back along the old edge n - 2 - k (the closing edge stays last)
  const points = [...loop.points].reverse();
  const arcs = points.map((_, k) => loop.arcs[(2 * n - 2 - k) % n]);
  return { points, arcs };
}

type Fillet = { arc: Arc; ta: Point; tb: Point };

/**
 * Where two shapes melt: the fillets' tangent points (the neck's heart) and how far along the melt
 * is, 0 the moment a neck appears (zero thick) to 1 once it's at least ρ thick or the shapes overlap
 */
export type Melt = { core: Point[]; strength: number };

/**
 * Two shapes melted with fillet radius `rho`: the fillets, the necks they make, and the points
 * where the outlines themselves cross
 */
function melt(a: Shape, b: Shape, rho: number): { fillets: Fillet[]; necks: Loop[]; corners: Point[]; melts: Melt[] } {
  const overlap =
    Math.max(a.x, b.x) < Math.min(a.x + a.width, b.x + b.width) &&
    Math.max(a.y, b.y) < Math.min(a.y + a.height, b.y + b.height);
  const corners = overlap ? crossings(a, b, 0) : [];
  const fillets =
    rho > 0
      ? crossings(a, b, rho)
          .map(([x, y]) => ({ arc: { x, y, r: rho }, ta: closest(a, x, y), tb: closest(b, x, y) }))
          // A fillet that only grazes a flat side has nothing to fill
          .filter((f) => Math.hypot(f.ta[0] - f.tb[0], f.ta[1] - f.tb[1]) > 0.01)
      : [];
  if (!fillets.length) return { fillets, necks: [], corners, melts: [] };

  const ca = center(a);
  const cb = center(b);
  if (!corners.length) {
    if (fillets.length !== 2) return { fillets: [], necks: [], corners, melts: [] };
    const [f, g] = fillets;
    // How thick the neck is at its thinnest: the ball fits between them below zero, and it's snapped
    const thickness = Math.hypot(f.arc.x - g.arc.x, f.arc.y - g.arc.y) - 2 * rho;
    if (thickness < 0) return { fillets: [], necks: [], corners, melts: [] };
    // Apart: one neck between the two fillets, closed through both centers so its edges stay inside
    const neck = clockwise({ points: [f.ta, f.tb, cb, g.tb, g.ta, ca], arcs: [f.arc, null, null, g.arc, null, null] });
    const melt = { core: [f.ta, f.tb, g.tb, g.ta], strength: Math.min(1, thickness / rho) };
    return { fillets, necks: [neck], corners, melts: [melt] };
  }
  // Overlapping: each fillet fills the corner where the outlines cross nearest to it
  const necks: Loop[] = [];
  const melts: Melt[] = [];
  for (const f of fillets) {
    let q = corners[0];
    for (const c of corners) {
      if (Math.hypot(c[0] - f.arc.x, c[1] - f.arc.y) < Math.hypot(q[0] - f.arc.x, q[1] - f.arc.y)) q = c;
    }
    necks.push(clockwise({ points: [f.ta, f.tb, cb, q, ca], arcs: [f.arc, null, null, null, null] }));
    melts.push({ core: [f.ta, f.tb, q], strength: 1 });
  }
  return { fillets, necks, corners, melts };
}

/*
 * The outline of a rounded rectangle as a closed track, clockwise from the top-left end of its
 * top side: sides and quarter arcs, each with its length, so a point on it has a position s.
 * Angles grow clockwise on screen (y down).
 */
type Step =
  | { line: true; x0: number; y0: number; x1: number; y1: number; len: number }
  | { line: false; x: number; y: number; r: number; a0: number; len: number };
type Track = { steps: Step[]; starts: number[]; length: number };

function track(s: Shape): Track {
  const r = s.radius;
  const l = s.x + r;
  const t = s.y + r;
  const rr = s.x + s.width - r;
  const b = s.y + s.height - r;
  const quarter = (r * Math.PI) / 2;
  const steps: Step[] = [
    { line: true, x0: l, y0: s.y, x1: rr, y1: s.y, len: rr - l },
    { line: false, x: rr, y: t, r, a0: -Math.PI / 2, len: quarter },
    { line: true, x0: rr + r, y0: t, x1: rr + r, y1: b, len: b - t },
    { line: false, x: rr, y: b, r, a0: 0, len: quarter },
    { line: true, x0: rr, y0: b + r, x1: l, y1: b + r, len: rr - l },
    { line: false, x: l, y: b, r, a0: Math.PI / 2, len: quarter },
    { line: true, x0: l - r, y0: b, x1: l - r, y1: t, len: b - t },
    { line: false, x: l, y: t, r, a0: Math.PI, len: quarter },
  ];
  const starts: number[] = [];
  let length = 0;
  for (const step of steps) {
    starts.push(length);
    length += step.len;
  }
  return { steps, starts, length };
}

function pointOn(step: Step, u: number): Point {
  if (step.line) {
    const k = step.len ? u / step.len : 0;
    return [step.x0 + (step.x1 - step.x0) * k, step.y0 + (step.y1 - step.y0) * k];
  }
  const angle = step.a0 + (step.r ? u / step.r : 0);
  return [step.x + step.r * Math.cos(angle), step.y + step.r * Math.sin(angle)];
}

function pointAt(tr: Track, s: number): Point {
  s = ((s % tr.length) + tr.length) % tr.length;
  for (let k = tr.steps.length - 1; k >= 0; k--) if (s >= tr.starts[k]) return pointOn(tr.steps[k], s - tr.starts[k]);
  return pointOn(tr.steps[0], 0);
}

/** Position along the track of a point on (or nearest to) it */
function locate(tr: Track, [px, py]: Point): number {
  let best = Infinity;
  let at = 0;
  tr.steps.forEach((step, k) => {
    let u: number;
    if (step.line) {
      const ex = step.x1 - step.x0;
      const ey = step.y1 - step.y0;
      const len2 = ex * ex + ey * ey;
      u = len2 ? Math.min(Math.max(((px - step.x0) * ex + (py - step.y0) * ey) / len2, 0), 1) * step.len : 0;
    } else {
      let delta = Math.atan2(py - step.y, px - step.x) - step.a0;
      delta -= 2 * Math.PI * Math.floor((delta + Math.PI) / (2 * Math.PI));
      u = Math.min(Math.max(delta, 0), Math.PI / 2) * step.r;
    }
    const [x, y] = pointOn(step, u);
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < best - 1e-12) {
      best = d;
      at = tr.starts[k] + u;
    }
  });
  return at;
}

/** Angle from (cx, cy) to p, and an angle wrapped into (-π, π] */
const angleOf = (cx: number, cy: number, p: Point) => Math.atan2(p[1] - cy, p[0] - cx);
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));

/** Where a fillet's arc is along its own sweep, 0 at ta to 1 at tb; outside 0..1 when off the arc */
function alongFillet(f: Fillet, p: Point) {
  const a0 = angleOf(f.arc.x, f.arc.y, f.ta);
  const sweep = wrap(angleOf(f.arc.x, f.arc.y, f.tb) - a0);
  return sweep ? wrap(angleOf(f.arc.x, f.arc.y, p) - a0) / sweep : -1;
}

/** Where a circle meets a circle */
function circles(ax: number, ay: number, ar: number, bx: number, by: number, br: number): Point[] {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < EPS || d > ar + br || d < Math.abs(ar - br)) return [];
  const a = (ar * ar - br * br + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ar * ar - a * a));
  const mx = ax + (dx * a) / d;
  const my = ay + (dy * a) / d;
  return [
    [mx - (dy * h) / d, my + (dx * h) / d],
    [mx + (dy * h) / d, my - (dx * h) / d],
  ];
}

/** Where a circle meets one step of a track */
function circleStep(cx: number, cy: number, r: number, step: Step): Point[] {
  if (!step.len) return [];
  if (!step.line) {
    return circles(cx, cy, r, step.x, step.y, step.r).filter((p) => {
      const u = wrap(angleOf(step.x, step.y, p) - step.a0);
      return u >= -EPS && u <= Math.PI / 2 + EPS;
    });
  }
  const ex = step.x1 - step.x0;
  const ey = step.y1 - step.y0;
  const fx = step.x0 - cx;
  const fy = step.y0 - cy;
  const a = ex * ex + ey * ey;
  const b = 2 * (fx * ex + fy * ey);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((t) => t >= -EPS && t <= 1 + EPS)
    .map((t) => [step.x0 + ex * t, step.y0 + ey * t] as Point);
}

/** A piece of the union's outline: part of a shape's track, or part of a fillet arc */
type OutlinePiece =
  | { kind: "track"; shape: number; s0: number; s1: number; start: Point; end: Point }
  | { kind: "arc"; arc: Arc; start: Point; end: Point };

/** Piece ends closer than this join; pieces shorter than this are dropped, px: far below a pixel */
const JOIN = 0.1;
const near = (p: Point, q: Point) => Math.abs(p[0] - q[0]) < JOIN && Math.abs(p[1] - q[1]) < JOIN;

/**
 * The union's outline as closed loops of pieces, or null if none close (then the path falls back
 * to the overlapping pieces). Each shape's track is cut where fillets touch it and where other
 * shapes cross it; a cut piece stays if its middle isn't inside anything else. Where two shapes
 * share an edge exactly, the earlier one keeps it.
 */
function outline(
  shapes: Shape[],
  tracks: Track[],
  cuts: Point[][],
  fillets: Fillet[],
  necks: Loop[],
): OutlinePiece[][] | null {
  const covered = (p: Point, self: number) => {
    for (let i = 0; i < shapes.length; i++) {
      if (i === self) continue;
      const d = roundedBox(p[0], p[1], shapes[i]);
      if (d < -1e-4 || (i < self && d <= 1e-4)) return true;
    }
    return piecesDistance([], necks, p[0], p[1]) < -1e-4;
  };

  /*
   * Where a fillet's arc crosses another shape or another arc, both are cut there too: in a crowd
   * one pair's neck can run into a third shape. Not at the arc's own ends, where it only touches.
   */
  const arcCuts: Point[][] = fillets.map(() => []);
  const inside = (f: Fillet, p: Point) => {
    const u = alongFillet(f, p);
    return (
      u > 1e-6 &&
      u < 1 - 1e-6 &&
      Math.hypot(p[0] - f.ta[0], p[1] - f.ta[1]) > 1e-3 &&
      Math.hypot(p[0] - f.tb[0], p[1] - f.tb[1]) > 1e-3
    );
  };
  fillets.forEach((f, k) => {
    tracks.forEach((tr, i) => {
      for (const step of tr.steps) {
        for (const p of circleStep(f.arc.x, f.arc.y, f.arc.r, step)) {
          if (!inside(f, p)) continue;
          arcCuts[k].push(p);
          cuts[i] = [...cuts[i], p];
        }
      }
    });
    for (let m = k + 1; m < fillets.length; m++) {
      const g = fillets[m];
      for (const p of circles(f.arc.x, f.arc.y, f.arc.r, g.arc.x, g.arc.y, g.arc.r)) {
        if (!inside(f, p) || !inside(g, p)) continue;
        arcCuts[k].push(p);
        arcCuts[m].push(p);
      }
    }
  });

  const pieces: OutlinePiece[] = [];
  shapes.forEach((_, i) => {
    const tr = tracks[i];
    if (tr.length <= 0) return;
    const at = cuts[i].map((p) => ({ p, s: locate(tr, p) })).sort((u, v) => u.s - v.s);
    // Cuts that coincide are one cut
    const marks = at.filter((m, k) => k === 0 || m.s - at[k - 1].s > 1e-6);
    if (marks.length > 1 && marks[0].s + tr.length - marks[marks.length - 1].s <= 1e-6) marks.pop();
    if (!marks.length) {
      const start = pointAt(tr, 0);
      if (!covered(pointAt(tr, tr.length / 2), i)) {
        pieces.push({ kind: "track", shape: i, s0: 0, s1: tr.length, start, end: start });
      }
      return;
    }
    marks.forEach((m, k) => {
      const next = marks[(k + 1) % marks.length];
      const s1 = next.s > m.s ? next.s : next.s + tr.length;
      if (!covered(pointAt(tr, (m.s + s1) / 2), i)) {
        pieces.push({ kind: "track", shape: i, s0: m.s, s1, start: m.p, end: next.p });
      }
    });
  });
  for (const [k, f] of fillets.entries()) {
    const a0 = angleOf(f.arc.x, f.arc.y, f.ta);
    const sweep = wrap(angleOf(f.arc.x, f.arc.y, f.tb) - a0);
    const at = (u: number): Point => [
      f.arc.x + f.arc.r * Math.cos(a0 + sweep * u),
      f.arc.y + f.arc.r * Math.sin(a0 + sweep * u),
    ];
    const marks = [0, ...arcCuts[k].map((p) => alongFillet(f, p)), 1].sort((u, v) => u - v);
    const points = marks.map((u, n) => (n === 0 ? f.ta : n === marks.length - 1 ? f.tb : at(u)));
    for (let n = 0; n + 1 < marks.length; n++) {
      if (marks[n + 1] - marks[n] < 1e-6) continue;
      if (!covered(at((marks[n] + marks[n + 1]) / 2), -1)) {
        pieces.push({ kind: "arc", arc: f.arc, start: points[n], end: points[n + 1] });
      }
    }
  }

  /*
   * Joined end to start. A crowd of three or more can leave a pocket between them that pairwise
   * fillets don't reach; its pieces don't close into a loop, and are dropped, which fills it.
   */
  const loops: OutlinePiece[][] = [];
  // Slivers between cuts that nearly coincide only lead chains astray
  const left = new Set(
    pieces.filter(
      (p) => (p.kind === "track" ? p.s1 - p.s0 : Math.hypot(p.end[0] - p.start[0], p.end[1] - p.start[1])) >= JOIN,
    ),
  );
  chain: while (left.size) {
    const first = left.values().next().value!;
    left.delete(first);
    const loop = [first];
    let end = first.end;
    while (!near(end, first.start)) {
      let next: OutlinePiece | undefined;
      for (const piece of left) {
        if (near(piece.start, end)) {
          next = piece;
          break;
        }
        // Arcs run either way
        if (piece.kind === "arc" && near(piece.end, end)) {
          next = { ...piece, start: piece.end, end: piece.start };
          left.delete(piece);
          left.add(next);
          break;
        }
      }
      if (!next) continue chain;
      left.delete(next);
      loop.push(next);
      end = next.end;
    }
    loops.push(loop);
  }
  return loops.length ? loops : null;
}

/** The shapes melted together wherever they are closer than `merge` px (twice the fillet radius) */
export function meltShapes(input: Shape[], merge: number): Blob {
  const shapes = input.map((s) => ({ ...s, radius: Math.max(0, Math.min(s.radius, s.width / 2, s.height / 2)) }));
  const rho = merge / 2;
  const necks: Loop[] = [];
  const melts: Melt[] = [];
  const fillets: Fillet[] = [];
  const cuts: Point[][] = shapes.map(() => []);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x + s.width);
    y1 = Math.max(y1, s.y + s.height);
  }
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const s = shapes[i];
      const t = shapes[j];
      // Boxes further apart than 2ρ can't meet
      const gapX = Math.max(s.x, t.x) - Math.min(s.x + s.width, t.x + t.width);
      const gapY = Math.max(s.y, t.y) - Math.min(s.y + s.height, t.y + t.height);
      if (Math.hypot(Math.max(gapX, 0), Math.max(gapY, 0)) >= Math.max(2 * rho, EPS)) continue;
      const pair = melt(s, t, rho);
      necks.push(...pair.necks);
      melts.push(...pair.melts);
      fillets.push(...pair.fillets);
      for (const f of pair.fillets) {
        cuts[i].push(f.ta);
        cuts[j].push(f.tb);
      }
      cuts[i].push(...pair.corners);
      cuts[j].push(...pair.corners);
    }
  }
  const tracks = shapes.map(track);
  // Also with nothing melting: a shape inside another drops out of the outline
  const loops = shapes.length ? outline(shapes, tracks, cuts, fillets, necks) : null;
  // Necks stay within the shapes' hull, so the shapes' box bounds everything
  const bounds = shapes.length
    ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    : { x: 0, y: 0, width: 0, height: 0 };
  return { shapes, necks, melts, bounds, tracks, loops };
}

const n2 = (v: number) => Math.round(v * 100) / 100;

/** Commands that follow a track from s0 to s1 (s1 > s0, at most one lap), from wherever the pen is */
function follow(tr: Track, s0: number, s1: number, dx: number, dy: number): string {
  let d = "";
  for (const lap of [0, tr.length]) {
    tr.steps.forEach((step, k) => {
      const from = Math.max(s0, tr.starts[k] + lap);
      const to = Math.min(s1, tr.starts[k] + lap + step.len);
      if (to - from <= 1e-9) return;
      const [x, y] = pointOn(step, to - tr.starts[k] - lap);
      d += step.line
        ? `L${n2(x - dx)} ${n2(y - dy)}`
        : `A${n2(step.r)} ${n2(step.r)} 0 0 1 ${n2(x - dx)} ${n2(y - dy)}`;
    });
  }
  return d;
}

/**
 * SVG / CSS / Path2D path data of the blob, shifted by (-dx, -dy): its outline, without the edges
 * where pieces overlap inside, so strokes and cut-outs along it stay clean
 */
export function blobPath({ shapes, necks, tracks, loops }: Blob, dx = 0, dy = 0): string {
  if (!shapes.length) return "M0 0Z";
  let d = "";
  if (loops) {
    for (const loop of loops) {
      d += `M${n2(loop[0].start[0] - dx)} ${n2(loop[0].start[1] - dy)}`;
      for (const piece of loop) {
        if (piece.kind === "track") {
          d += follow(tracks[piece.shape], piece.s0, piece.s1, dx, dy);
        } else {
          const { arc, start, end } = piece;
          // The short way round, in whichever direction gets there
          const sweep = (start[0] - arc.x) * (end[1] - arc.y) - (start[1] - arc.y) * (end[0] - arc.x) > 0 ? 1 : 0;
          d += `A${n2(arc.r)} ${n2(arc.r)} 0 0 ${sweep} ${n2(end[0] - dx)} ${n2(end[1] - dy)}`;
        }
      }
      d += "Z";
    }
    return d;
  }
  // No outline (nothing melts, or it didn't close): the pieces themselves, a nonzero fill of which is the union
  shapes.forEach((_, i) => {
    const [x, y] = pointAt(tracks[i], 0);
    d += `M${n2(x - dx)} ${n2(y - dy)}${follow(tracks[i], 0, tracks[i].length, dx, dy)}Z`;
  });
  for (const { points, arcs } of necks) {
    d += `M${n2(points[0][0] - dx)} ${n2(points[0][1] - dy)}`;
    for (let i = 0; i < points.length; i++) {
      const [px, py] = points[i];
      const [qx, qy] = points[(i + 1) % points.length];
      const arc = arcs[i];
      if (arc) {
        const sweep = (px - arc.x) * (qy - arc.y) - (py - arc.y) * (qx - arc.x) > 0 ? 1 : 0;
        d += `A${n2(arc.r)} ${n2(arc.r)} 0 0 ${sweep} ${n2(qx - dx)} ${n2(qy - dy)}`;
      } else {
        d += `L${n2(qx - dx)} ${n2(qy - dy)}`;
      }
    }
    d += "Z";
  }
  return d;
}

/** Signed distance to a rounded rectangle: negative inside. Hot: no Math.hypot, which is slow */
export function roundedBox(px: number, py: number, s: Shape) {
  const hx = s.width / 2;
  const hy = s.height / 2;
  const qx = Math.abs(px - (s.x + hx)) - (hx - s.radius);
  const qy = Math.abs(py - (s.y + hy)) - (hy - s.radius);
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const inside = qx > qy ? qx : qy;
  return Math.sqrt(ox * ox + oy * oy) + (inside < 0 ? inside : 0) - s.radius;
}

/** Signed distance to a polygon of any shape: negative inside */
export function polygon(px: number, py: number, points: Point[]) {
  let d = Infinity;
  let sign = 1;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const ex = xj - xi;
    const ey = yj - yi;
    const wx = px - xi;
    const wy = py - yi;
    const len = ex * ex + ey * ey;
    const t = len ? Math.min(Math.max((wx * ex + wy * ey) / len, 0), 1) : 0;
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const above = py >= yi;
    const below = py < yj;
    const left = ex * wy > ey * wx;
    if ((above && below && left) || (!above && !below && !left)) sign = -sign;
  }
  return sign * Math.sqrt(d);
}

/**
 * Signed distance to the blob, negative inside. Exact on the outline and outside; inside, the
 * depth below the edge of whichever piece reaches deepest, which is what shading needs.
 */
export function blobDistance({ shapes, necks }: Blob, px: number, py: number): number {
  return piecesDistance(shapes, necks, px, py);
}

/** The same for a blob's pieces */
function piecesDistance(shapes: Shape[], necks: Loop[], px: number, py: number): number {
  let d = Infinity;
  for (let i = 0; i < shapes.length; i++) {
    const s = roundedBox(px, py, shapes[i]);
    if (s < d) d = s;
  }
  for (let i = 0; i < necks.length; i++) {
    const { points, arcs } = necks[i];
    let n = polygon(px, py, points);
    // Minus the fillet discs
    for (let k = 0; k < arcs.length; k++) {
      const arc = arcs[k];
      if (!arc) continue;
      const dx = px - arc.x;
      const dy = py - arc.y;
      const disc = arc.r - Math.sqrt(dx * dx + dy * dy);
      if (disc > n) n = disc;
    }
    if (n < d) d = n;
  }
  return d;
}

/**
 * The outline as plain edges for distance queries: straight lines, and arcs no wider than a half
 * turn, from unit direction (ux0, uy0) to (ux1, uy1) around their center, clockwise or not. Each
 * knows its outward normal: lines from their clockwise direction, arcs from whether they bulge out
 * (a shape's corner) or in (a fillet). Everything a query needs is precomputed: no trigonometry.
 */
export type Edge = Bounds &
  (
    | { line: true; x0: number; y0: number; ex: number; ey: number; len2: number; nx: number; ny: number }
    | {
        line: false;
        cx: number;
        cy: number;
        r: number;
        ux0: number;
        uy0: number;
        ux1: number;
        uy1: number;
        /** 1 when the arc runs clockwise on screen */
        turn: 1 | -1;
        out: 1 | -1;
      }
  );

function lineEdge(x0: number, y0: number, x1: number, y1: number): Edge {
  const ex = x1 - x0;
  const ey = y1 - y0;
  const len = Math.sqrt(ex * ex + ey * ey) || 1;
  return {
    line: true,
    x0,
    y0,
    ex,
    ey,
    len2: ex * ex + ey * ey,
    // Clockwise on screen, the outside is to the left of the direction
    nx: ey / len,
    ny: -ex / len,
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(ex),
    height: Math.abs(ey),
  };
}

function arcEdge(cx: number, cy: number, r: number, a: number, span: number, out: 1 | -1): Edge {
  return {
    line: false,
    cx,
    cy,
    r,
    ux0: Math.cos(a),
    uy0: Math.sin(a),
    ux1: Math.cos(a + span),
    uy1: Math.sin(a + span),
    turn: span >= 0 ? 1 : -1,
    out,
    x: cx - r,
    y: cy - r,
    width: 2 * r,
    height: 2 * r,
  };
}

/** Edges of part of a track, s0 to s1 (s1 > s0, at most one lap) */
function trackEdges(tr: Track, s0: number, s1: number, out: Edge[]) {
  for (const lap of [0, tr.length]) {
    tr.steps.forEach((step, k) => {
      const from = Math.max(s0, tr.starts[k] + lap) - tr.starts[k] - lap;
      const to = Math.min(s1, tr.starts[k] + lap + step.len) - tr.starts[k] - lap;
      if (to - from <= 1e-9) return;
      if (step.line) {
        const [x0, y0] = pointOn(step, from);
        const [x1, y1] = pointOn(step, to);
        out.push(lineEdge(x0, y0, x1, y1));
      } else {
        out.push(arcEdge(step.x, step.y, step.r, step.a0 + from / step.r, (to - from) / step.r, 1));
      }
    });
  }
}

/** The blob's outline as edges; without an outline, every shape's whole outline */
export function blobEdges({ tracks, loops }: Blob): Edge[] {
  const out: Edge[] = [];
  if (!loops) {
    for (const tr of tracks) trackEdges(tr, 0, tr.length, out);
    return out;
  }
  for (const loop of loops) {
    for (const piece of loop) {
      if (piece.kind === "track") {
        trackEdges(tracks[piece.shape], piece.s0, piece.s1, out);
      } else {
        const { arc, start, end } = piece;
        const a = angleOf(arc.x, arc.y, start);
        out.push(arcEdge(arc.x, arc.y, arc.r, a, wrap(angleOf(arc.x, arc.y, end) - a), -1));
      }
    }
  }
  return out;
}

export type Nearest = { d: number; nx: number; ny: number; inside: boolean };

/**
 * The nearest edge: distance to it, its outward normal there, and which side the point is on (the
 * outline is smooth, so the nearest edge's normal tells). Written into `into`: no allocation.
 */
export function nearestEdge(edges: Edge[], px: number, py: number, into: Nearest) {
  let best = Infinity;
  // The nearest point, the normal there, and every normal that ties at it. Hot: no closures, no allocation
  let qx = 0;
  let qy = 0;
  let nx = 0;
  let ny = -1;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    // Up to two candidates per edge: the nearest point on it, or both ends of an arc off its sweep
    let count = 1;
    let d2a = 0;
    let xa = 0;
    let ya = 0;
    let uxa = 0;
    let uya = 0;
    let d2b = Infinity;
    let xb = 0;
    let yb = 0;
    let uxb = 0;
    let uyb = 0;
    if (e.line) {
      let t = e.len2 ? ((px - e.x0) * e.ex + (py - e.y0) * e.ey) / e.len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      xa = e.x0 + e.ex * t;
      ya = e.y0 + e.ey * t;
      d2a = (px - xa) * (px - xa) + (py - ya) * (py - ya);
      uxa = e.nx;
      uya = e.ny;
    } else {
      const dx = px - e.cx;
      const dy = py - e.cy;
      // Within the sweep when on the turning side of both ends' directions
      if ((e.ux0 * dy - e.uy0 * dx) * e.turn >= 0 && (dx * e.uy1 - dy * e.ux1) * e.turn >= 0) {
        const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        const ux = dx / dist;
        const uy = dy / dist;
        xa = e.cx + e.r * ux;
        ya = e.cy + e.r * uy;
        d2a = (dist - e.r) * (dist - e.r);
        uxa = ux * e.out;
        uya = uy * e.out;
      } else {
        // Off the sweep: its ends
        count = 2;
        xa = e.cx + e.r * e.ux0;
        ya = e.cy + e.r * e.uy0;
        d2a = (px - xa) * (px - xa) + (py - ya) * (py - ya);
        uxa = e.ux0 * e.out;
        uya = e.uy0 * e.out;
        xb = e.cx + e.r * e.ux1;
        yb = e.cy + e.r * e.uy1;
        d2b = (px - xb) * (px - xb) + (py - yb) * (py - yb);
        uxb = e.ux1 * e.out;
        uyb = e.uy1 * e.out;
      }
    }
    for (let c = 0; c < count; c++) {
      const d2 = c ? d2b : d2a;
      if (d2 < best - 1e-9) {
        best = d2;
        qx = c ? xb : xa;
        qy = c ? yb : ya;
        nx = sx = c ? uxb : uxa;
        ny = sy = c ? uyb : uya;
      } else if (d2 <= best + 1e-9) {
        // A corner where two edges meet: their normals together tell inside from out
        sx += c ? uxb : uxa;
        sy += c ? uyb : uya;
      }
    }
  }
  into.d = Math.sqrt(best);
  into.nx = nx;
  into.ny = ny;
  into.inside = (px - qx) * sx + (py - qy) * sy < 0;
}

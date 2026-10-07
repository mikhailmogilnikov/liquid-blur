import { describe, expect, it } from "vitest";
import { blobDistance, blobEdges, blobPath, meltShapes, nearestEdge, type Nearest, type Point } from "../src/blob";

const capsule = (x: number, width = 100, y = 0) => ({ x, y, width, height: 40, radius: 20 });

/** Signed area: positive when wound clockwise on screen */
const area = (points: Point[]) =>
  points.reduce((sum, [x, y], n) => {
    const [nx, ny] = points[(n + 1) % points.length];
    return sum + (x * ny - nx * y) / 2;
  }, 0);

describe("meltShapes", () => {
  it("leaves shapes further apart than the merge distance alone", () => {
    const blob = meltShapes([capsule(0), capsule(130)], 24);
    expect(blob.necks).toHaveLength(0);
    expect(blobDistance(blob, 115, 20)).toBeGreaterThan(0);
  });

  it("grows a concave neck between close shapes", () => {
    const blob = meltShapes([capsule(0), capsule(110)], 24);
    expect(blob.necks).toHaveLength(1);
    // Filled in the middle of the gap, open at its top and bottom
    expect(blobDistance(blob, 105, 20)).toBeLessThan(0);
    expect(blobDistance(blob, 105, 1)).toBeGreaterThan(0);
    expect(blobDistance(blob, 105, 39)).toBeGreaterThan(0);
  });

  it("never grows past the shapes: two capsules in a row stay as tall", () => {
    for (const x of [110, 104, 90]) {
      const blob = meltShapes([capsule(0), capsule(x)], 24);
      for (let px = -5; px <= x + 105; px += 1) {
        expect(blobDistance(blob, px, -0.5)).toBeGreaterThan(0);
        expect(blobDistance(blob, px, 40.5)).toBeGreaterThan(0);
      }
    }
  });

  it("is exact on the outline", () => {
    const blob = meltShapes([capsule(0), capsule(110)], 24);
    expect(blobDistance(blob, 50, 0)).toBeCloseTo(0, 6);
    expect(blobDistance(blob, 0, 20)).toBeCloseTo(0, 6);
    expect(blobDistance(blob, 50, -3)).toBeCloseTo(3, 6);
  });

  it("fills the corners where overlapping shapes meet", () => {
    // A drop sitting half over the top edge of a bar
    const blob = meltShapes([{ x: 0, y: 30, width: 200, height: 40, radius: 20 }, { x: 80, y: 0, width: 40, height: 40, radius: 20 }], 24);
    expect(blob.necks).toHaveLength(2);
    // Just outside the drop where it meets the bar: filled
    expect(blobDistance(blob, 78, 29)).toBeLessThan(0);
    expect(blobDistance(blob, 122, 29)).toBeLessThan(0);
  });

  it("winds every neck clockwise, so a nonzero fill is the union", () => {
    const blobs = [
      meltShapes([capsule(0), capsule(110)], 24),
      meltShapes([capsule(0), capsule(60, 100, 25)], 24),
      meltShapes([capsule(0), capsule(105, 40, 30)], 24),
    ];
    for (const blob of blobs) for (const neck of blob.necks) expect(area(neck.points)).toBeGreaterThan(0);
  });

  it("is empty without shapes", () => {
    const blob = meltShapes([], 24);
    expect(blob.necks).toEqual([]);
    expect(blobPath(blob)).toBe("M0 0Z");
  });
});

/** Every point the path moves or draws to */
const vertices = (d: string): Point[] =>
  [...d.matchAll(/([MLA])([^MLAZ]*)/g)].map(([, cmd, args]) => {
    const n = args.trim().split(/[\s,]+/).map(Number);
    return (cmd === "A" ? [n[5], n[6]] : [n[0], n[1]]) as Point;
  });

describe("blobPath", () => {
  it("draws a capsule with arcs, shifted", () => {
    expect(blobPath(meltShapes([{ x: 10, y: 10, width: 40, height: 20, radius: 10 }], 0), 10, 10)).toBe(
      "M10 0L30 0A10 10 0 0 1 40 10A10 10 0 0 1 30 20L10 20A10 10 0 0 1 0 10A10 10 0 0 1 10 0Z",
    );
  });

  it("outlines melted shapes as one loop, without inner edges", () => {
    const cases = [
      [capsule(0), capsule(110)],
      // Overlapping, tops flush: the dock's orb bouncing into the bar
      [capsule(0), capsule(80, 40)],
      // Overlapping, offset
      [capsule(0), capsule(60, 100, 25)],
      // A row of three
      [capsule(0), capsule(108), capsule(216)],
    ];
    for (const shapes of cases) {
      const blob = meltShapes(shapes, 24);
      const d = blobPath(blob);
      expect(d.match(/M/g)).toHaveLength(1);
      for (const [x, y] of vertices(d)) expect(Math.abs(blobDistance(blob, x, y))).toBeLessThan(0.02);
    }
  });

  it("keeps separate shapes as separate loops", () => {
    expect(blobPath(meltShapes([capsule(0), capsule(130)], 24)).match(/M/g)).toHaveLength(2);
  });

  it("closes the outline for any arrangement", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 1000; n++) {
      const shapes = Array.from({ length: 2 + Math.floor(random() * 3) }, () => {
        const height = 20 + random() * 40;
        return { x: random() * 200, y: random() * 80, width: height + random() * 120, height, radius: height / 2 };
      });
      const blob = meltShapes(shapes, 8 + random() * 40);
      if (blob.necks.length) expect(blob.loops).not.toBeNull();
      for (const [x, y] of vertices(blobPath(blob))) expect(Math.abs(blobDistance(blob, x, y))).toBeLessThan(0.02);
    }
  });
});

describe("nearestEdge", () => {
  it("measures to the outline itself, and knows inside from out", () => {
    const blobs = [
      meltShapes([capsule(0), capsule(110)], 24),
      meltShapes([capsule(0), capsule(80, 40)], 24),
      meltShapes([{ x: 0, y: 30, width: 200, height: 40, radius: 20 }, { x: 80, y: 0, width: 40, height: 40, radius: 20 }], 24),
      // Overlapping without fillets: sharp corners, and blobDistance exact outside
      meltShapes([capsule(0), capsule(60, 100, 25)], 0),
    ];
    const n: Nearest = { d: 0, nx: 0, ny: 0, inside: false };
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const blob of blobs) {
      const edges = blobEdges(blob);
      for (let k = 0; k < 2000; k++) {
        const x = -20 + random() * 260;
        const y = -20 + random() * 110;
        const d = blobDistance(blob, x, y);
        if (Math.abs(d) < 0.01) continue;
        nearestEdge(edges, x, y, n);
        expect(n.inside).toBe(d < 0);
        // blobDistance is exact outside plain shapes and a bound elsewhere: the outline is never nearer
        expect(n.d).toBeGreaterThanOrEqual(Math.abs(d) - 1e-6);
        if (d > 0 && !blob.necks.length) expect(n.d).toBeCloseTo(d, 6);
      }
    }
  });

  it("hides the edges that melted inside", () => {
    // The drop's bottom edge runs inside the bar: no edge there
    const blob = meltShapes([{ x: 0, y: 30, width: 200, height: 40, radius: 20 }, { x: 80, y: 0, width: 40, height: 40, radius: 20 }], 24);
    const n: Nearest = { d: 0, nx: 0, ny: 0, inside: false };
    nearestEdge(blobEdges(blob), 100, 40, n);
    expect(n.d).toBeGreaterThan(20);
  });
});

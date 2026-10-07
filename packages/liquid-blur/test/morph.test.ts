import { afterEach, describe, expect, it, vi } from "vitest";
import { createMorph } from "../src/morph";

/** A parent with the control, and the panel's content */
function scene() {
  const parent = document.createElement("div");
  parent.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  const source = document.createElement("button");
  source.className = "lb lb-interactive lb-clear";
  source.id = "plus";
  source.innerHTML = "<svg></svg>";
  source.getBoundingClientRect = () => new DOMRect(20, 20, 44, 44);
  parent.append(source);
  const content = document.createElement("div");
  content.style.borderRadius = "28px";
  content.getBoundingClientRect = () => new DOMRect(20, 20, 240, 200);
  document.body.append(parent, content);
  return { parent, source, content };
}

const quick = {
  x: { duration: 0.05, bounce: 0 },
  y: { duration: 0.05, bounce: 0 },
  width: { duration: 0.05, bounce: 0 },
  height: { duration: 0.06, bounce: 0 },
  progress: { duration: 0.05, bounce: 0 },
};
const fast = { open: quick, close: quick };

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createMorph", () => {
  it("needs a source with a parent", () => {
    const { content } = scene();
    expect(() => createMorph({ source: document.createElement("div"), content })).toThrow();
  });

  it("puts a copy of the control next to it, hidden at rest", () => {
    const { parent, source, content } = scene();
    createMorph({ source, content });
    const shape = parent.children[2] as HTMLElement;
    // The control, the stub (for a lift over a group) and the shape
    expect(parent.children).toHaveLength(3);
    // The control's look and icon, without its behaviors, id or focus
    expect(shape.className).toBe("lb lb-clear");
    expect(shape.id).toBe("");
    expect(shape.querySelector("svg")).not.toBeNull();
    expect(shape.tabIndex).toBe(-1);
    expect(shape.style.display).toBe("none");
    expect(content.style.visibility).toBe("hidden");
    expect(source.getAttribute("aria-expanded")).toBe("false");
  });

  it("swells into the panel", async () => {
    const { parent, source, content } = scene();
    await new Promise<void>((resolve) => {
      const morph = createMorph({ source, content, spring: fast, onRest: () => resolve() });
      morph.open();
      // The control is away the whole time
      expect(source.style.visibility).toBe("hidden");
      expect(source.getAttribute("aria-expanded")).toBe("true");
    });
    const shape = parent.children[2] as HTMLElement;
    expect(source.style.visibility).toBe("hidden");
    expect(shape.style.transform).toBe("translate(20px, 20px)");
    expect(shape.style.width).toBe("240px");
    expect(shape.style.height).toBe("200px");
    expect(shape.style.borderRadius).toBe("28px");
    // The icon is gone
    expect((shape.firstElementChild as SVGElement).style.opacity).toBe("0");
    expect(content.style.transform).toBe("");
    expect(content.style.clipPath).toBe("");
    expect(content.style.filter).toBe("");
  });

  it("keeps the corners still while the size still wobbles", async () => {
    const { parent, source, content } = scene();
    const wobbly = {
      x: { duration: 0.05, bounce: 0 },
      y: { duration: 0.05, bounce: 0 },
      width: { duration: 0.4, bounce: 0.7 },
      height: { duration: 0.45, bounce: 0.7 },
      progress: { duration: 0.05, bounce: 0 },
    };
    createMorph({ source, content, spring: { open: wobbly, close: wobbly } }).open();
    const shape = parent.children[2] as HTMLElement;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    // Long after the progress is done, well before the size is
    await new Promise((resolve) => setTimeout(resolve, 200));
    const seen = new Set<string>();
    const widths = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await frame();
      seen.add(shape.style.borderRadius);
      widths.add(shape.style.width);
    }
    expect(widths.size).toBeGreaterThan(1);
    expect([...seen]).toEqual(["28px"]);
  });

  it("goes from the control's real corners to the panel's, never an oval", async () => {
    const { parent, source, content } = scene();
    // A capsule written the usual way: drawn as half its height
    source.style.borderRadius = "9999px";
    source.getBoundingClientRect = () => new DOMRect(20, 20, 120, 44);
    const slow = {
      x: { duration: 0.2, bounce: 0 },
      y: { duration: 0.2, bounce: 0 },
      width: { duration: 0.2, bounce: 0.3 },
      height: { duration: 0.2, bounce: 0.3 },
      progress: { duration: 0.2, bounce: 0 },
    };
    const radii: number[] = [];
    let done = false;
    await new Promise<void>((resolve) => {
      const morph = createMorph({
        source,
        content,
        spring: { open: slow, close: slow },
        onRest: () => {
          done = true;
          resolve();
        },
      });
      morph.open();
      const shape = parent.children[2] as HTMLElement;
      const watch = () => {
        radii.push(parseFloat(shape.style.borderRadius));
        if (!done) requestAnimationFrame(watch);
      };
      watch();
    });
    // A capsule at the start, not 9999px; one radius on both axes all the way (an `rx / ry`
    // pair wouldn't parse here); the panel's corners exactly at rest
    expect(radii[0]).toBe(22);
    expect(radii.every((r) => r >= 22 && r <= 28)).toBe(true);
    expect((parent.children[2] as HTMLElement).style.borderRadius).toBe("28px");
  });

  it("closing from rest, holds the shape a beat while the content goes", async () => {
    const { parent, source, content } = scene();
    const lazy = { ...quick, width: { duration: 1, bounce: 0 } };
    let rest: (open: boolean) => void = () => {};
    const morph = createMorph({ source, content, spring: { open: quick, close: lazy }, onRest: (open) => rest(open) });
    await new Promise<boolean>((resolve) => {
      rest = resolve;
      morph.open();
    });
    morph.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const shape = parent.children[2] as HTMLElement;
    // Well inside the 120ms hold: the panel's size still, the content already on its way out
    expect(shape.style.width).toBe("240px");
    expect(Number(content.style.opacity)).toBeLessThan(1);
    morph.destroy();
  });

  it("runs past the target once, then eases back without swinging", async () => {
    const { parent, source, content } = scene();
    // The panel's center is right of the control's: x has 158px to go
    content.getBoundingClientRect = () => new DOMRect(100, 20, 160, 44);
    const set = {
      ...quick,
      x: { duration: 0.3, bounce: 0.5, settle: 0 },
      width: { duration: 0.3, bounce: 0 },
      progress: { duration: 0.3, bounce: 0 },
    };
    const xs: number[] = [];
    let done = false;
    await new Promise<void>((resolve) => {
      const morph = createMorph({
        source,
        content,
        spring: { open: set, close: set },
        onRest: () => {
          done = true;
          resolve();
        },
      });
      morph.open();
      const shape = parent.children[2] as HTMLElement;
      const watch = () => {
        const tx = parseFloat(shape.style.transform.slice("translate(".length));
        xs.push(tx + parseFloat(shape.style.width) / 2);
        if (!done) requestAnimationFrame(watch);
      };
      watch();
    });
    const target = 180;
    const peak = Math.max(...xs);
    // Past it by about a sixth of the way (a 0.5 bounce), once
    expect(peak - target).toBeGreaterThan(158 * 0.12);
    expect(peak - target).toBeLessThan(158 * 0.2);
    const after = xs.slice(xs.indexOf(peak));
    expect(after.every((x, i) => i === 0 || x <= after[i - 1] + 1e-6)).toBe(true);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(target - 0.25);
  });

  it("turns around midway and gives the control back at rest", async () => {
    const { parent, source, content } = scene();
    let rest: (open: boolean) => void = () => {};
    const morph = createMorph({ source, content, spring: fast, onRest: (open) => rest(open) });
    morph.open();
    const rested = new Promise<boolean>((resolve) => (rest = resolve));
    morph.close();
    expect(await rested).toBe(false);
    const shape = parent.children[2] as HTMLElement;
    expect(source.style.visibility).toBe("");
    expect(shape.style.display).toBe("none");
    expect(content.style.visibility).toBe("hidden");
  });

  it("measures a just-pressed control at its resting size", () => {
    const { parent, source, content } = scene();
    // Swollen by a press: on screen it's bigger only while the scale is on
    source.style.scale = "1.2";
    source.getBoundingClientRect = () =>
      source.style.scale === "none" ? new DOMRect(20, 20, 44, 44) : new DOMRect(15.6, 15.6, 52.8, 52.8);
    const morph = createMorph({ source, content, spring: fast });
    morph.open();
    const shape = parent.children[2] as HTMLElement;
    // The shape starts as the control at rest, and the press is left as it was
    expect(shape.style.width).toBe("44px");
    expect(shape.style.transform).toBe("translate(20px, 20px)");
    expect(source.style.scale).toBe("1.2");
    morph.destroy();
  });

  it("dresses the copy as the control is when it goes", () => {
    const { parent, source, content } = scene();
    const morph = createMorph({ source, content, spring: fast });
    source.textContent = "Oldest";
    morph.open();
    const shape = parent.children[2] as HTMLElement;
    // Loose text is boxed, so it can fade and stay on its spot
    const label = shape.firstElementChild as HTMLElement;
    expect(label.tagName).toBe("SPAN");
    expect(label.textContent).toBe("Oldest");
    expect(label.style.position).toBe("absolute");
    morph.destroy();
  });

  it("passes a click on the shrinking shape to the control", () => {
    const { parent, source, content } = scene();
    const morph = createMorph({ source, content });
    const shape = parent.children[2] as HTMLElement;
    let clicks = 0;
    source.addEventListener("click", () => clicks++);
    morph.open();
    // Opening, the shape lets clicks through to the panel
    expect(shape.style.pointerEvents).toBe("none");
    morph.close();
    expect(shape.style.pointerEvents).toBe("");
    shape.click();
    expect(clicks).toBe(1);
  });

  it("stays in a group when the panel opens beside the neighbors", () => {
    const { parent, source, content } = scene();
    parent.className = "lb-group";
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () => new DOMRect(300, 20, 80, 44);
    parent.prepend(bar);
    const morph = createMorph({ source, content, spring: fast });
    morph.open();
    const shape = parent.lastElementChild as HTMLElement;
    expect(shape.parentElement).toBe(parent);
    expect(shape.style.zIndex).toBe("");
    morph.destroy();
  });

  it("lifts out over a group when the panel covers a neighbor, leaving a stub in it", async () => {
    const { parent, source, content } = scene();
    parent.className = "lb-group";
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () => new DOMRect(70, 120, 160, 44);
    parent.prepend(bar);
    const rested = new Promise<boolean>((resolve) => {
      const morph = createMorph({ source, content, spring: fast, onRest: resolve });
      morph.open();
    });
    const stub = source.nextElementSibling as HTMLElement;
    const shape = parent.nextElementSibling as HTMLElement;
    // Out of the group, right after it and above it; the stub in the group where the control was
    expect(shape.getAttribute("aria-hidden")).toBe("true");
    expect(shape.style.zIndex).toBe("1");
    expect(stub.style.display).toBe("");
    expect(stub.style.width).toBe("44px");
    // First frame: the stub whole under the lifted copy, which never fades
    expect(stub.style.transform).toBe("translate(20px, 20px) scale(1)");
    expect(shape.style.opacity).toBe("");
    expect(await rested).toBe(true);
    expect(shape.style.opacity).toBe("");
    expect(stub.style.display).toBe("none");
  });

  it("turns a round control's corners into a squircle panel's, where corner-shape is drawn", async () => {
    vi.spyOn(window, "CSS", "get").mockReturnValue({ supports: (property: string) => property === "corner-shape" } as unknown as typeof CSS);
    const { parent, source, content } = scene();
    content.style.setProperty("corner-shape", "squircle");
    const shapes: string[] = [];
    await new Promise<void>((resolve) => {
      const morph = createMorph({ source, content, spring: fast, onRest: () => resolve() });
      morph.open();
      shapes.push((parent.children[2] as HTMLElement).style.getPropertyValue("corner-shape"));
    });
    const shape = parent.children[2] as HTMLElement;
    // Round to start with, the panel's squircle at rest
    expect(shapes[0]).toBe("superellipse(1)");
    expect(shape.style.getPropertyValue("corner-shape")).toBe("superellipse(2)");
    vi.restoreAllMocks();
  });

  it("leaves corner-shape alone where the browser doesn't draw it", async () => {
    vi.spyOn(window, "CSS", "get").mockReturnValue({ supports: () => false } as unknown as typeof CSS);
    const { parent, source, content } = scene();
    content.style.setProperty("corner-shape", "squircle");
    await new Promise<void>((resolve) => createMorph({ source, content, spring: fast, onRest: () => resolve() }).open());
    expect((parent.children[2] as HTMLElement).style.getPropertyValue("corner-shape")).toBe("");
    vi.restoreAllMocks();
  });

  it("puts everything back on destroy", () => {
    const { parent, source, content } = scene();
    createMorph({ source, content }).destroy();
    expect(parent.children).toHaveLength(1);
    expect(parent.nextElementSibling).toBe(content);
    expect(content.getAttribute("style")).toBe("border-radius: 28px;");
    expect(source.hasAttribute("aria-expanded")).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMorph } from "../../src/morph/index";

/** A parent with the control, and the panel it flows into, each where it is at rest */
function scene() {
  const parent = document.createElement("div");
  parent.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  const button = document.createElement("button");
  button.className = "lb lb-interactive lb-clear";
  button.id = "plus";
  button.innerHTML = "<svg></svg>";
  button.getBoundingClientRect = () => new DOMRect(20, 20, 44, 44);
  parent.append(button);
  const panel = document.createElement("div");
  panel.style.borderRadius = "28px";
  panel.getBoundingClientRect = () => new DOMRect(20, 20, 240, 200);
  document.body.append(parent, panel);
  return { parent, button, panel };
}

const quick = {
  x: { duration: 0.05, bounce: 0 },
  y: { duration: 0.05, bounce: 0 },
  width: { duration: 0.05, bounce: 0 },
  height: { duration: 0.06, bounce: 0 },
  progress: { duration: 0.05, bounce: 0 },
};
const fast = { grow: quick, shrink: quick };
const slow = {
  x: { duration: 0.2, bounce: 0 },
  y: { duration: 0.2, bounce: 0 },
  width: { duration: 0.2, bounce: 0 },
  height: { duration: 0.2, bounce: 0 },
  progress: { duration: 0.2, bounce: 0 },
};

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createMorph", () => {
  it("needs states, each with a parent, the initial one among them", () => {
    const { button, panel } = scene();
    expect(() => createMorph({ states: [] })).toThrow();
    expect(() => createMorph({ states: [button, document.createElement("div")] })).toThrow();
    expect(() => createMorph({ states: [button], initial: panel })).toThrow();
  });

  it("starts at the first state, the others away", () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel] });
    expect(morph.current).toBe(button);
    expect(morph.moving).toBe(false);
    expect(button.hasAttribute("data-fk-away")).toBe(false);
    expect(button.style.visibility).toBe("visible");
    expect(panel.hasAttribute("data-fk-away")).toBe(true);
    expect(panel.style.opacity).toBe("0");
    expect(panel.style.visibility).toBe("hidden");
    expect(panel.style.pointerEvents).toBe("none");
    morph.destroy();
  });

  it("starts at the initial state when given one, quietly", () => {
    const { parent, button, panel } = scene();
    const told: string[] = [];
    const morph = createMorph({
      states: [button, panel],
      initial: panel,
      onStart: () => told.push("start"),
      onRest: () => told.push("rest"),
      onProgress: () => told.push("progress"),
    });
    expect(morph.current).toBe(panel);
    expect(button.hasAttribute("data-fk-away")).toBe(true);
    expect(panel.style.visibility).toBe("visible");
    expect(parent.children).toHaveLength(1);
    expect(told).toEqual([]);
    morph.destroy();
  });

  it("puts the shape next to the smaller state only while it flies", async () => {
    const { parent, button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    // At rest the parent has its own children only: `:last-child` still holds
    expect(parent.children).toHaveLength(1);
    const going = morph.to(panel);
    expect(parent.children).toHaveLength(2);
    const shape = button.nextElementSibling as HTMLElement;
    expect(shape.hasAttribute("data-fk-part")).toBe(true);
    expect(shape.getAttribute("aria-hidden")).toBe("true");
    // Outside a group it wears no classes: copies in it would be its descendants to the stylesheet
    expect(shape.className).toBe("");
    // The control rides in it as a copy: its look and icon, without its behaviors, id or focus
    const copy = shape.querySelector("button") as HTMLButtonElement;
    expect(copy.className).toBe("lb lb-clear");
    expect(copy.id).toBe("");
    expect(copy.inert).toBe(true);
    expect(copy.querySelector("svg")).not.toBeNull();
    expect(await going).toBe(true);
    // Landed as the panel, the shape stays under it a frame, then leaves
    await frame();
    await frame();
    expect(parent.children).toHaveLength(1);
    expect(await morph.to(button)).toBe(true);
    expect(parent.children).toHaveLength(1);
    morph.destroy();
  });

  it("flies the bigger state itself, magnified and out of focus, settling sharp", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    // First frame: the panel at the control, magnified, blurred, unseen, clipped to the shape
    expect(panel.style.transform).toContain("scale(1.45)");
    expect(panel.style.filter).toBe("blur(14px)");
    expect(panel.style.opacity).toBe("0");
    expect(panel.style.clipPath.startsWith("inset(")).toBe(true);
    // The control is away the whole time
    expect(button.hasAttribute("data-fk-away")).toBe(true);
    expect(button.style.opacity).toBe("0");
    await going;
    // At rest it's itself again: nothing of the morph stays on it
    expect(panel.hasAttribute("data-fk-away")).toBe(false);
    expect(panel.style.transform).toBe("");
    expect(panel.style.clipPath).toBe("");
    expect(panel.style.filter).toBe("");
    expect(panel.style.opacity).toBe("");
    expect(panel.style.visibility).toBe("visible");
    expect(button.style.visibility).toBe("hidden");
    morph.destroy();
  });

  it("keeps a state that holds focus focusable while it's away", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    button.focus();
    await morph.to(panel, { instant: true });
    expect(button.style.opacity).toBe("0");
    expect(button.style.visibility).toBe("visible");
    morph.destroy();
  });

  it("starts the shape as the state at rest and lands it on the other", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    expect(shape.style.transform).toBe("translate(20px, 20px)");
    expect(shape.style.width).toBe("44px");
    expect(shape.style.height).toBe("44px");
    await going;
    expect(shape.style.transform).toBe("translate(20px, 20px)");
    expect(shape.style.width).toBe("240px");
    expect(shape.style.height).toBe("200px");
    expect(shape.style.borderRadius).toBe("28px");
    morph.destroy();
  });

  it("keeps the corners still while the size still wobbles", async () => {
    const { button, panel } = scene();
    const wobbly = {
      x: { duration: 0.05, bounce: 0 },
      y: { duration: 0.05, bounce: 0 },
      width: { duration: 0.4, bounce: 0.7 },
      height: { duration: 0.45, bounce: 0.7 },
      progress: { duration: 0.05, bounce: 0 },
    };
    const morph = createMorph({ states: [button, panel], spring: { grow: wobbly } });
    void morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    // Long after the progress is done, well before the size is
    await wait(200);
    const seen = new Set<string>();
    const widths = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await frame();
      seen.add(shape.style.borderRadius);
      widths.add(shape.style.width);
    }
    expect(widths.size).toBeGreaterThan(1);
    expect([...seen]).toEqual(["28px"]);
    morph.destroy();
  });

  it("goes from the control's real corners to the panel's, never an oval", async () => {
    const { button, panel } = scene();
    // A capsule written the usual way: drawn as half its height
    button.style.borderRadius = "9999px";
    button.getBoundingClientRect = () => new DOMRect(20, 20, 120, 44);
    const radii: number[] = [];
    const morph = createMorph({
      states: [button, panel],
      spring: { grow: { ...slow, width: { duration: 0.2, bounce: 0.3 }, height: { duration: 0.2, bounce: 0.3 } } },
      onProgress: () => radii.push(parseFloat((button.nextElementSibling as HTMLElement).style.borderRadius)),
    });
    await morph.to(panel);
    // A capsule at the start, not 9999px; one radius on both axes all the way (an `rx / ry`
    // pair wouldn't parse here); the panel's corners exactly at rest
    expect(radii[0]).toBe(22);
    expect(radii.every((r) => r >= 22 && r <= 28)).toBe(true);
    expect(radii.at(-1)).toBe(28);
    morph.destroy();
  });

  it("gives each corner its own radius, a percent as the box makes it", async () => {
    const { button, panel } = scene();
    // A sheet rounded on top only, its radius a percent: 24px across, 20px down
    panel.style.borderRadius = "10% 10% 0 0";
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    await going;
    // Circular, never an oval: the smaller of the two
    expect(shape.style.borderRadius).toBe("20px 20px 0px 0px");
    morph.destroy();
  });

  it("shrinking from rest, holds the shape a beat while the contents go", async () => {
    const { button, panel } = scene();
    const lazy = { ...quick, width: { duration: 1, bounce: 0 } };
    const morph = createMorph({ states: [button, panel], initial: panel, spring: { shrink: lazy } });
    void morph.to(button);
    await wait(50);
    const shape = button.nextElementSibling as HTMLElement;
    // Well inside the 120ms hold: the panel's size still, its contents already on their way out
    expect(shape.style.width).toBe("240px");
    expect(Number(panel.style.opacity)).toBeLessThan(1);
    morph.destroy();
  });

  it("runs past the target once, then eases back without swinging", async () => {
    const { button, panel } = scene();
    // The panel's center is right of the control's: x has 138px to go
    panel.getBoundingClientRect = () => new DOMRect(100, 20, 160, 44);
    const set = {
      ...quick,
      x: { duration: 0.3, bounce: 0.5, settle: 0 },
      width: { duration: 0.3, bounce: 0 },
      progress: { duration: 0.3, bounce: 0 },
    };
    const xs: number[] = [];
    const morph = createMorph({
      states: [button, panel],
      spring: { grow: set },
      onProgress: () => {
        const shape = button.nextElementSibling as HTMLElement;
        const tx = parseFloat(shape.style.transform.slice("translate(".length));
        xs.push(tx + parseFloat(shape.style.width) / 2);
      },
    });
    await morph.to(panel);
    const target = 180;
    const peak = Math.max(...xs);
    // Past it by about a sixth of the way (a 0.5 bounce), once
    expect(peak - target).toBeGreaterThan(138 * 0.12);
    expect(peak - target).toBeLessThan(138 * 0.2);
    const after = xs.slice(xs.indexOf(peak));
    // Never back up: the shape's place and width are each drawn to a hundredth of a pixel
    expect(after.every((x, i) => i === 0 || x <= after[i - 1] + 0.02)).toBe(true);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(target - 0.25);
    morph.destroy();
  });

  it("turns around midway and gives the control back at rest", async () => {
    const { parent, button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const back = morph.to(button);
    expect(await going).toBe(false);
    expect(await back).toBe(true);
    expect(button.hasAttribute("data-fk-away")).toBe(false);
    expect(button.style.opacity).toBe("");
    expect(parent.children).toHaveLength(1);
    expect(panel.hasAttribute("data-fk-away")).toBe(true);
    expect(panel.style.visibility).toBe("hidden");
    morph.destroy();
  });

  it("takes the copy again as the state is when it turns around", () => {
    const { button, panel } = scene();
    button.textContent = "Oldest";
    const morph = createMorph({ states: [button, panel], spring: { grow: slow, shrink: slow } });
    void morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    expect(shape.querySelector("button")?.textContent).toBe("Oldest");
    // Pressed on the way, its label changed: back home it's the new one that rides
    button.textContent = "Newest";
    void morph.to(button);
    expect(shape.querySelectorAll("button")).toHaveLength(1);
    expect(shape.querySelector("button")?.textContent).toBe("Newest");
    morph.destroy();
  });

  it("starts over from where the shape is when sent to a third state", async () => {
    const { parent, button, panel } = scene();
    const sheet = document.createElement("div");
    sheet.getBoundingClientRect = () => new DOMRect(0, 200, 400, 200);
    document.body.append(sheet);
    const morph = createMorph({ states: [button, panel, sheet], spring: { grow: slow, shrink: slow } });
    const going = morph.to(panel);
    await wait(60);
    const elsewhere = morph.to(sheet);
    expect(await going).toBe(false);
    expect(await elsewhere).toBe(true);
    expect(morph.current).toBe(sheet);
    expect(sheet.style.visibility).toBe("visible");
    for (const el of [button, panel]) expect(el.hasAttribute("data-fk-away")).toBe(true);
    await frame();
    await frame();
    expect(parent.children).toHaveLength(1);
    morph.destroy();
  });

  it("doesn't bring back what has faded when started over again", async () => {
    const { button, panel } = scene();
    const sheet = document.createElement("div");
    sheet.getBoundingClientRect = () => new DOMRect(0, 200, 400, 200);
    document.body.append(sheet);
    const morph = createMorph({ states: [button, panel, sheet], spring: { grow: slow, shrink: slow } });
    void morph.to(panel);
    await wait(60);
    // Started over: what was on its way fades where it is
    void morph.to(sheet);
    await wait(120);
    const shape = button.nextElementSibling as HTMLElement;
    const opacity = (el: Element) => Number((el as HTMLElement).style.opacity || "1");
    const before = new Map([...shape.children].map((el) => [el, opacity(el)]));
    // Started over again before it's gone: none of it shows more than it did
    void morph.to(button);
    await frame();
    await frame();
    for (const el of shape.children) {
      if (before.has(el)) expect(opacity(el)).toBeLessThanOrEqual(before.get(el)! + 0.05);
    }
    morph.destroy();
  });

  it("keeps a popover's surface on the way: no copy of a state is a popover", () => {
    const { button, panel } = scene();
    // A popover that isn't open is `display: none`: a fill or a copy dressed as one would be hidden
    panel.setAttribute("popover", "manual");
    button.setAttribute("popover", "manual");
    const morph = createMorph({ states: [button, panel], spring: fast });
    void morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    expect(shape.querySelector("button")).not.toBeNull();
    expect(shape.hasAttribute("popover")).toBe(false);
    expect(shape.querySelectorAll("[popover]")).toHaveLength(0);
    morph.destroy();
  });

  it("lands on the control where it is now, after the page scrolled on the way", async () => {
    const { button, panel } = scene();
    const ys: number[] = [];
    const morph = createMorph({
      states: [button, panel],
      initial: panel,
      spring: { shrink: slow },
      onProgress: () =>
        ys.push(parseFloat((button.nextElementSibling as HTMLElement).style.transform.split(",")[1] ?? "0")),
    });
    const going = morph.to(button);
    // Scrolled 100px down on the way: everything is 100px higher on screen
    button.getBoundingClientRect = () => new DOMRect(20, -80, 44, 44);
    panel.getBoundingClientRect = () => new DOMRect(20, -80, 240, 200);
    document.dispatchEvent(new Event("scroll"));
    await going;
    expect(ys.at(-1)).toBeCloseTo(-80, 0);
    morph.destroy();
  });

  it("follows a state that changes size on the way, when told", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    // More came in: the panel is taller now
    panel.getBoundingClientRect = () => new DOMRect(20, 20, 240, 320);
    morph.update();
    await going;
    expect(shape.style.height).toBe("320px");
    morph.destroy();
  });

  it("follows a state that changes size on the way by itself", async () => {
    let notify: ResizeObserverCallback = () => {};
    const watched = new Set<Element>();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback;
        }
        observe(el: Element) {
          watched.add(el);
        }
        unobserve(el: Element) {
          watched.delete(el);
        }
        disconnect() {
          watched.clear();
        }
      },
    );
    const sized = (target: Element, width: number, height: number) =>
      ({
        target,
        borderBoxSize: [{ inlineSize: width, blockSize: height }],
        contentRect: new DOMRect(0, 0, width, height),
      }) as unknown as ResizeObserverEntry;
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: { grow: slow } });
    const going = morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    // Both ends are watched while it flies
    expect([...watched]).toEqual([button, panel]);
    const measured = vi.spyOn(panel, "getBoundingClientRect");
    // The first sighting, as they're watched, is only taken note of
    notify([sized(button, 44, 44), sized(panel, 240, 200)], {} as ResizeObserver);
    expect(measured).not.toHaveBeenCalled();
    // More came in: the panel is taller now
    panel.getBoundingClientRect = () => new DOMRect(20, 20, 240, 320);
    notify([sized(panel, 240, 320)], {} as ResizeObserver);
    await going;
    expect(shape.style.height).toBe("320px");
    // At rest nothing is watched
    expect(watched.size).toBe(0);
    morph.destroy();
  });

  it("measures a just-pressed control at its resting size", () => {
    const { button, panel } = scene();
    // Swollen by a press: on screen it's bigger only while the scale is on
    button.style.scale = "1.2";
    button.getBoundingClientRect = () =>
      button.style.scale === "" ? new DOMRect(20, 20, 44, 44) : new DOMRect(15.6, 15.6, 52.8, 52.8);
    const morph = createMorph({ states: [button, panel], spring: fast });
    void morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    // The shape starts as the control at rest, and the press is left as it was
    expect(shape.style.width).toBe("44px");
    expect(shape.style.transform).toBe("translate(20px, 20px)");
    expect(button.style.scale).toBe("1.2");
    morph.destroy();
  });

  it("passes a press on the shape to the smallest state under it at rest", () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: { grow: slow, shrink: slow } });
    const clicks: string[] = [];
    button.addEventListener("click", () => clicks.push("button"));
    panel.addEventListener("click", () => clicks.push("panel"));
    void morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    // Over both: the control, the smaller one
    shape.dispatchEvent(new MouseEvent("click", { clientX: 30, clientY: 30, bubbles: true }));
    // Over the panel alone
    shape.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 150, bubbles: true }));
    expect(clicks).toEqual(["button", "panel"]);
    morph.destroy();
  });

  it("takes presses on the state flying in, not on the one flying out", () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: { grow: slow, shrink: slow } });
    void morph.to(panel);
    expect(panel.style.pointerEvents).toBe("");
    void morph.to(button);
    expect(panel.style.pointerEvents).toBe("none");
    morph.destroy();
  });

  it("stays in a group when the panel opens beside the neighbors", () => {
    const { parent, button, panel } = scene();
    // A group running on the parent, as the contract says: no group code needed here
    parent.setAttribute("data-fk-surface", "");
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () => new DOMRect(300, 20, 80, 44);
    parent.prepend(bar);
    const morph = createMorph({ states: [button, panel], spring: fast });
    void morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    expect(shape.hasAttribute("data-fk-part")).toBe(true);
    expect(shape.style.zIndex).toBe("");
    morph.destroy();
  });

  it("lifts out over a group when the panel covers a neighbor, leaving a stub in it", async () => {
    const { parent, button, panel } = scene();
    parent.setAttribute("data-fk-surface", "");
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () => new DOMRect(70, 120, 160, 44);
    parent.prepend(bar);
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const stub = button.nextElementSibling as HTMLElement;
    const shape = parent.nextElementSibling as HTMLElement;
    // Out of the group, right after it and above it; the stub in the group where the control was
    expect(shape.hasAttribute("data-fk-part")).toBe(true);
    expect(shape.style.zIndex).toBe("1");
    expect(stub.hasAttribute("data-fk-part")).toBe(true);
    expect(stub.style.width).toBe("44px");
    // First frame: the stub whole under the lifted shape
    expect(stub.style.transform).toBe("translate(20px, 20px) scale(1)");
    expect(await going).toBe(true);
    expect(stub.isConnected).toBe(false);
    morph.destroy();
  });

  it("puts the shape in a container, out of a parent that clips", async () => {
    const { parent, button, panel } = scene();
    const container = document.createElement("div");
    document.body.append(container);
    const morph = createMorph({ states: [button, panel], container, spring: fast });
    const going = morph.to(panel);
    expect(container.lastElementChild?.hasAttribute("data-fk-part")).toBe(true);
    expect(parent.children).toHaveLength(1);
    await going;
    expect(await morph.to(button)).toBe(true);
    expect(container.children).toHaveLength(0);
    morph.destroy();
  });

  it("turns a round control's corners into a squircle panel's, where corner-shape is drawn", async () => {
    vi.spyOn(window, "CSS", "get").mockReturnValue({
      supports: (property: string) => property === "corner-shape",
    } as unknown as typeof CSS);
    const { button, panel } = scene();
    panel.style.setProperty("corner-shape", "squircle");
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    // Round to start with, the panel's squircle at rest
    expect(shape.style.getPropertyValue("corner-shape")).toBe("superellipse(1)");
    await going;
    expect(shape.style.getPropertyValue("corner-shape")).toBe("superellipse(2)");
    morph.destroy();
  });

  it("leaves corner-shape alone where the browser doesn't draw it", async () => {
    vi.spyOn(window, "CSS", "get").mockReturnValue({ supports: () => false } as unknown as typeof CSS);
    const { button, panel } = scene();
    panel.style.setProperty("corner-shape", "squircle");
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    const shape = button.nextElementSibling as HTMLElement;
    await going;
    expect(shape.style.getPropertyValue("corner-shape")).toBe("");
    morph.destroy();
  });

  it("keeps the bigger state's own translation under the morph's", () => {
    const { button, panel } = scene();
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el) =>
        ({
          borderTopLeftRadius: el === panel ? "28px" : "0px",
          borderTopRightRadius: el === panel ? "28px" : "0px",
          borderBottomRightRadius: el === panel ? "28px" : "0px",
          borderBottomLeftRadius: el === panel ? "28px" : "0px",
          transform: el === panel ? "matrix(1, 0, 0, 1, -120, -100)" : "none",
          visibility: "visible",
          getPropertyValue: () => "",
        }) as unknown as CSSStyleDeclaration,
    );
    const morph = createMorph({ states: [button, panel], spring: fast });
    void morph.to(panel);
    // First frame: scaled 1.45 about its corner, and the translation it has of its own kept, last
    const t = panel.style.transform;
    expect(t.endsWith(" matrix(1, 0, 0, 1, -120, -100)")).toBe(true);
    const [x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t)!.slice(1).map(Number);
    // Centered on the control (42, 42): the panel's box (20, 20, 240x200) scaled 1.45, then its own
    // -120/-100 scaled with it, which the morph's translate takes back
    expect(x).toBeCloseTo(42 - 20 - (1.45 * 240) / 2 + 0.45 * 120, 1);
    expect(y).toBeCloseTo(42 - 20 - (1.45 * 200) / 2 + 0.45 * 100, 1);
    morph.destroy();
  });

  it("takes springs in part, the rest the defaults'", async () => {
    const { button, panel } = scene();
    // Only growing's given: shrinking's left as the defaults', and nothing breaks for it
    const morph = createMorph({ states: [button, panel], spring: { grow: quick } });
    const start = performance.now();
    await morph.to(panel);
    // The given springs: well under the defaults' third of a second
    expect(performance.now() - start).toBeLessThan(250);
    expect(await morph.to(button)).toBe(true);
    morph.destroy();
  });

  it("tells where it's headed, and promises it", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    const going = morph.to(panel);
    expect(morph.current).toBe(panel);
    expect(morph.moving).toBe(true);
    // Asked again on the way: the same promise
    expect(morph.to(panel)).toBe(going);
    expect(await going).toBe(true);
    expect(morph.moving).toBe(false);
    // Asked where it is: done already
    expect(await morph.to(panel)).toBe(true);
    // Turned around before it gets there: that one's off
    const back = morph.to(button);
    const again = morph.to(panel);
    expect(await back).toBe(false);
    expect(await again).toBe(true);
    expect(() => morph.to(document.createElement("div"))).toThrow();
    morph.destroy();
  });

  it("swaps at once when asked to, or lands at once mid-way", async () => {
    const { parent, button, panel } = scene();
    const rests: HTMLElement[] = [];
    const morph = createMorph({
      states: [button, panel],
      spring: { grow: slow, shrink: slow },
      onRest: (at) => rests.push(at),
    });
    const done = morph.to(panel, { instant: true });
    // No shape: the states swap
    expect(parent.children).toHaveLength(1);
    expect(morph.moving).toBe(false);
    expect(panel.style.visibility).toBe("visible");
    expect(button.hasAttribute("data-fk-away")).toBe(true);
    expect(await done).toBe(true);
    const going = morph.to(button);
    expect(morph.moving).toBe(true);
    void morph.to(button, { instant: true });
    expect(morph.moving).toBe(false);
    expect(await going).toBe(true);
    expect(rests).toEqual([panel, button]);
    morph.destroy();
  });

  it("swaps at once with reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { parent, button, panel } = scene();
    const morph = createMorph({ states: [button, panel] });
    void morph.to(panel);
    expect(parent.children).toHaveLength(1);
    expect(morph.moving).toBe(false);
    morph.destroy();
  });

  it("calls onStart each way, turning around included", () => {
    const { button, panel } = scene();
    const started: [HTMLElement, HTMLElement][] = [];
    const morph = createMorph({
      states: [button, panel],
      spring: fast,
      onStart: (to, from) => started.push([to, from]),
    });
    void morph.to(panel);
    void morph.to(button);
    void morph.to(button);
    void morph.to(panel);
    expect(started).toEqual([
      [panel, button],
      [button, panel],
      [panel, button],
    ]);
    morph.destroy();
  });

  it("tells the progress toward where it's headed every frame, from 0 to 1", async () => {
    const { button, panel } = scene();
    const seen: [number, HTMLElement, HTMLElement | null][] = [];
    const morph = createMorph({
      states: [button, panel],
      spring: fast,
      onProgress: (progress, to, from) => seen.push([progress, to, from]),
    });
    await morph.to(panel);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.every(([, to, from]) => to === panel && from === button)).toBe(true);
    const progress = seen.map(([p]) => p);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1] - 1e-9))).toBe(true);
    morph.destroy();
  });

  it("counts the progress toward the other end once turned around, without a jump", async () => {
    const { button, panel } = scene();
    const seen: [number, HTMLElement][] = [];
    const morph = createMorph({
      states: [button, panel],
      spring: { grow: slow, shrink: slow },
      onProgress: (progress, to) => seen.push([progress, to]),
    });
    void morph.to(panel);
    await wait(80);
    const before = seen.length;
    const [last] = seen[before - 1];
    expect(last).toBeGreaterThan(0);
    await morph.to(button);
    const [first, to] = seen[before];
    expect(to).toBe(button);
    expect(first).toBeCloseTo(1 - last, 6);
    expect(seen.at(-1)).toEqual([1, button]);
    morph.destroy();
  });

  it("tells the progress from nowhere once started over mid-way", async () => {
    const { button, panel } = scene();
    const sheet = document.createElement("div");
    sheet.getBoundingClientRect = () => new DOMRect(0, 200, 400, 200);
    document.body.append(sheet);
    const froms = new Set<HTMLElement | null>();
    const morph = createMorph({
      states: [button, panel, sheet],
      spring: { grow: slow, shrink: slow },
      onProgress: (_, to, from) => to === sheet && froms.add(from),
    });
    void morph.to(panel);
    await wait(60);
    await morph.to(sheet);
    expect([...froms]).toEqual([null]);
    morph.destroy();
  });

  it("tells the progress once, done, when it swaps at once", async () => {
    const { button, panel } = scene();
    const seen: [number, HTMLElement, HTMLElement | null][] = [];
    const morph = createMorph({
      states: [button, panel],
      onProgress: (progress, to, from) => seen.push([progress, to, from]),
    });
    await morph.to(panel, { instant: true });
    expect(seen).toEqual([[1, panel, button]]);
    morph.destroy();
  });

  it("takes a state added later, away until it's asked for", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: fast });
    const card = document.createElement("div");
    card.getBoundingClientRect = () => new DOMRect(20, 300, 120, 80);
    expect(() => morph.to(card)).toThrow();
    // Not in the page yet: nothing to lay it out by
    expect(() => morph.add(card)).toThrow();
    document.body.append(card);
    morph.add(card);
    // Added twice: once
    morph.add(card);
    expect(card.hasAttribute("data-fk-away")).toBe(true);
    expect(card.style.visibility).toBe("hidden");
    expect(await morph.to(card)).toBe(true);
    expect(morph.current).toBe(card);
    expect(card.style.visibility).toBe("visible");
    morph.destroy();
    // Destroyed, it gives the added one its own styles back too
    expect(card.hasAttribute("data-fk-away")).toBe(false);
    expect(card.style.visibility).toBe("");
  });

  it("lets go of a state, its own styles given back", () => {
    const { button, panel } = scene();
    panel.style.opacity = "0.9";
    const morph = createMorph({ states: [button, panel], spring: fast });
    expect(() => morph.remove(button)).toThrow();
    morph.remove(panel);
    expect(panel.hasAttribute("data-fk-away")).toBe(false);
    expect(panel.style.opacity).toBe("0.9");
    expect(panel.style.visibility).toBe("");
    expect(panel.style.pointerEvents).toBe("");
    expect(() => morph.to(panel)).toThrow();
    // Let go twice: nothing more
    morph.remove(panel);
    morph.destroy();
  });

  it("lands at once when one end of the flight under way is let go", async () => {
    const { button, panel } = scene();
    const morph = createMorph({ states: [button, panel], spring: { grow: slow, shrink: slow } });
    const going = morph.to(panel);
    morph.remove(button);
    expect(morph.moving).toBe(false);
    expect(await going).toBe(true);
    expect(button.hasAttribute("data-fk-away")).toBe(false);
    expect(button.style.opacity).toBe("");
    expect(panel.style.transform).toBe("");
    morph.destroy();
  });

  it("puts everything back on destroy, and does nothing after", async () => {
    const { parent, button, panel } = scene();
    const morph = createMorph({ states: [button, panel] });
    const going = morph.to(panel);
    morph.destroy();
    expect(await going).toBe(false);
    expect(parent.children).toHaveLength(1);
    expect(parent.nextElementSibling).toBe(panel);
    expect(panel.getAttribute("style")).toBe("border-radius: 28px;");
    expect(button.hasAttribute("data-fk-away")).toBe(false);
    expect(await morph.to(panel)).toBe(false);
    morph.add(document.body);
    expect(document.body.hasAttribute("data-fk-away")).toBe(false);
    expect(parent.children).toHaveLength(1);
  });

  it("morphs any element: no material, no other module", async () => {
    const { parent, panel } = scene();
    // A plain button styled by a class of the page's own
    const fab = document.createElement("button");
    fab.className = "fab";
    fab.textContent = "+";
    fab.getBoundingClientRect = () => new DOMRect(300, 300, 56, 56);
    parent.append(fab);
    const morph = createMorph({ states: [fab, panel], spring: fast });
    const going = morph.to(panel);
    const shape = fab.nextElementSibling as HTMLElement;
    expect(shape.hasAttribute("data-fk-part")).toBe(true);
    expect(shape.querySelector(".fab")?.textContent).toBe("+");
    await going;
    expect(shape.style.width).toBe("240px");
    expect(await morph.to(fab)).toBe(true);
    expect(fab.nextElementSibling).toBeNull();
    morph.destroy();
  });
});

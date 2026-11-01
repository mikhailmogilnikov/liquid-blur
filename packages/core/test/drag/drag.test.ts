import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createDrag, type DragOptions } from "../../src/drag/index";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
});
afterEach(() => {
  // A pointer a test left down is let go, so no drag keeps it from the next test
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, isPrimary: true }));
  // And a click a drag waits to drop stops waiting, as its timer would have
  vi.advanceTimersByTime(1000);
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** An element 100 × 40 in a parent, as laid out (happy-dom lays nothing out) */
function scene() {
  const parent = document.createElement("div");
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { value: 100 });
  Object.defineProperty(el, "offsetHeight", { value: 40 });
  parent.append(el);
  document.body.append(parent);
  return { parent, el };
}

function pointer(target: Element, type: string, x: number, y: number, { id = 1, pointerType = "mouse" } = {}) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pointerId: id,
      pointerType,
      isPrimary: true,
      clientX: x,
      clientY: y,
    }),
  );
}

/** Down at (x, y), then to (x + dx, y + dy) in `steps` moves over `ms`, still down */
function pull(target: Element, x: number, y: number, dx: number, dy: number, steps = 10, ms = 160) {
  pointer(target, "pointerdown", x, y);
  for (let i = 1; i <= steps; i++) {
    vi.advanceTimersByTime(ms / steps);
    pointer(target, "pointermove", x + (dx * i) / steps, y + (dy * i) / steps);
  }
  return { x: x + dx, y: y + dy };
}

/** Its offset as written */
const at = (el: HTMLElement) => {
  const [x = 0, y = 0] = el.style.translate.split(" ").map(Number.parseFloat);
  return { x, y };
};
const settle = () => vi.advanceTimersByTime(2000);
const click = (el: Element) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return !event.defaultPrevented;
};
const make = (el: HTMLElement, options: Partial<DragOptions> = {}) => createDrag({ element: el, ...options });

describe("createDrag", () => {
  it("starts at its initial snap point", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100], initial: 1 });
    expect(at(el)).toEqual({ x: 100, y: 0 });
    expect(drag.current).toBe(1);
    expect(drag.moving).toBe(false);
  });

  it("follows the pointer along its axis, all but the slop", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x" });
    pull(el, 0, 0, 30, 0, 3);
    expect(at(el)).toEqual({ x: 26, y: 0 });
    expect(drag.dragging).toBe(true);
    expect(el.hasAttribute("data-dragging")).toBe(true);
  });

  it("moves by all but the slop on a first move that goes far at once", () => {
    const { el } = scene();
    make(el, { axis: "x" });
    pull(el, 0, 0, 150, 0, 1);
    expect(at(el).x).toBe(146);
  });

  it("leaves a move across its axis to the page", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x" });
    pull(el, 0, 0, 2, 20);
    expect(drag.dragging).toBe(false);
    expect(at(el)).toEqual({ x: 0, y: 0 });
  });

  it("settles on the nearest snap point when let go still", () => {
    const { el } = scene();
    const onEnd = vi.fn();
    const onRest = vi.fn();
    const drag = make(el, { axis: "x", snaps: [0, 100], onEnd, onRest });
    const end = pull(el, 0, 0, 60, 0);
    vi.advanceTimersByTime(200);
    pointer(el, "pointerup", end.x, end.y);
    expect(onEnd).toHaveBeenCalledWith(1);
    settle();
    expect(at(el).x).toBe(100);
    expect(drag.current).toBe(1);
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it("reaches the snap point a flick would slide to, past nearer ones", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100, 200] });
    const end = pull(el, 0, 0, 40, 0, 4, 40);
    pointer(el, "pointerup", end.x, end.y);
    settle();
    expect(drag.current).toBe(2);
    expect(at(el).x).toBe(200);
  });

  it("is rubber past its bounds, and stops at them with no rubber", () => {
    const { el } = scene();
    make(el, { axis: "x", snaps: [0, 100] });
    pull(el, 0, 0, 204, 0);
    // A pull of 100px past the bound shows as (1 - 1 / (100 * 0.55 / 100 + 1)) * 100
    expect(at(el).x).toBeCloseTo(135.48, 1);
    pointer(el, "pointerup", 204, 0);
    document.body.innerHTML = "";

    const hard = scene();
    make(hard.el, { axis: "x", snaps: [0, 100], rubberband: 0 });
    pull(hard.el, 0, 0, 204, 0);
    expect(at(hard.el).x).toBe(100);
  });

  it("drops the click a drag ends in, not a tap's", () => {
    const { el } = scene();
    make(el, { axis: "x", snaps: [0, 100] });
    const end = pull(el, 0, 0, 60, 0);
    pointer(el, "pointerup", end.x, end.y);
    expect(click(el)).toBe(false);
    settle();
    pointer(el, "pointerdown", 100, 0);
    pointer(el, "pointerup", 100, 0);
    expect(click(el)).toBe(true);
  });

  it("caught on its way and let go unmoved, goes on where it was going, and the tap is a click", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100] });
    drag.snap(1);
    vi.advanceTimersByTime(80);
    const x = at(el).x;
    expect(x).toBeGreaterThan(2);
    expect(x).toBeLessThan(98);
    pointer(el, "pointerdown", x, 0);
    expect(drag.dragging).toBe(true);
    pointer(el, "pointerup", x, 0);
    expect(click(el)).toBe(true);
    settle();
    expect(at(el).x).toBe(100);
  });

  it("caught on its way and dragged, moves from where it was caught", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100] });
    drag.snap(1);
    vi.advanceTimersByTime(80);
    const x = at(el).x;
    pull(el, x, 0, -20, 0);
    expect(at(el).x).toBeCloseTo(x - 16, 0);
  });

  it("as good as there, isn't caught: it's put in place, and a press finds it at rest", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100] });
    drag.snap(1);
    vi.advanceTimersByTime(450);
    expect(drag.moving).toBe(true);
    pointer(el, "pointerdown", 100, 0);
    expect(drag.dragging).toBe(false);
    expect(drag.moving).toBe(false);
    expect(at(el).x).toBe(100);
  });

  it("goes somewhere by hand, within its bounds, at once without a rest it never set off for", () => {
    const { el } = scene();
    const onRest = vi.fn();
    const drag = make(el, { axis: "x", bounds: { x: [0, 100] }, onRest });
    drag.to(300);
    settle();
    expect(at(el).x).toBe(100);
    expect(drag.current).toBeNull();
    expect(onRest).toHaveBeenCalledTimes(1);
    drag.to(40, { instant: true });
    settle();
    expect(at(el).x).toBe(40);
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it("follows the pointer on a spring with `follow`", () => {
    const { el } = scene();
    make(el, { axis: "x", follow: { duration: 0.2, bounce: 0 } });
    pull(el, 0, 0, 50, 0, 1, 16);
    vi.advanceTimersByTime(16);
    expect(at(el).x).toBeGreaterThan(0);
    expect(at(el).x).toBeLessThan(46);
    vi.advanceTimersByTime(800);
    expect(at(el).x).toBeCloseTo(46, 0);
  });

  it("hands nested handles' pointer to the innermost that starts", () => {
    const { el: outer } = scene();
    const inner = document.createElement("div");
    Object.defineProperty(inner, "offsetWidth", { value: 50 });
    outer.append(inner);
    const outerDrag = make(outer);
    const innerDrag = make(inner, { axis: "x" });
    pull(inner, 0, 0, 30, 0);
    expect(innerDrag.dragging).toBe(true);
    expect(outerDrag.dragging).toBe(false);
  });

  it("reads its snap points again on update, and follows them", () => {
    const { el } = scene();
    let far = 100;
    const drag = make(el, { axis: "x", snaps: () => [0, far], initial: 1 });
    far = 160;
    drag.update();
    expect(at(el).x).toBe(160);
  });

  it("hands out copies of its position and speed", () => {
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100] });
    drag.position.x = 50;
    drag.velocity.x = 999;
    expect(drag.position.x).toBe(0);
    expect(drag.velocity.x).toBe(0);
  });

  it("holds the page's selection from the pointer going down until it's let go, given up or not", () => {
    const { el } = scene();
    make(el, { axis: "x" });
    const root = document.documentElement.style;
    pull(el, 0, 0, 2, 20);
    expect(root.userSelect).toBe("none");
    pointer(el, "pointerup", 2, 20);
    expect(root.userSelect).toBe("");
  });

  it("sets the handle's touch-action for its axis, and gives everything back on destroy", () => {
    const { el } = scene();
    el.style.translate = "1px 2px";
    const drag = make(el, { axis: "x" });
    expect(el.style.touchAction).toBe("pan-y pinch-zoom");
    drag.to(30, { instant: true });
    drag.destroy();
    expect(el.style.touchAction).toBe("");
    expect(el.style.translate).toBe("1px 2px");
    pull(el, 0, 0, 30, 0);
    expect(el.style.translate).toBe("1px 2px");
    drag.destroy();
  });

  it("with reduced motion, is on its point at once when let go", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList,
    );
    const { el } = scene();
    const drag = make(el, { axis: "x", snaps: [0, 100] });
    const end = pull(el, 0, 0, 60, 0);
    vi.advanceTimersByTime(200);
    pointer(el, "pointerup", end.x, end.y);
    expect(at(el).x).toBe(100);
    expect(drag.moving).toBe(false);
  });
});

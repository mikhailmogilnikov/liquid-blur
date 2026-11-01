import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { transitions } from "../../src/base";
import { createLayout, type LayoutOptions } from "../../src/layout/index";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const WIDTH = 300;
const pixels = (v: string) => parseFloat(v) || 0;
/** The layout's translation on an element, px */
const offset = (el: HTMLElement) => {
  const [x = "0", y = "0"] = el.style.translate.split(" ");
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
};
/** How tall it is laid out: held by the layout, or its own (twice that when open) */
const widthOf = (el: HTMLElement) => (el.style.width ? pixels(el.style.width) : Number(el.dataset.w ?? WIDTH));
const heightOf = (el: HTMLElement) =>
  el.style.height ? pixels(el.style.height) : Number(el.dataset.h) * (el.classList.contains("open") ? 2 : 1);
const inFlow = (el: HTMLElement) => el.style.position !== "absolute" && el.style.display !== "none";

/**
 * A list laid out as a column, as a browser would (happy-dom lays nothing out): each item as tall
 * as its `data-h`, one under the other, the root as tall as all of them unless held
 */
function list(heights: number[]) {
  const root = document.createElement("ul");
  const items = heights.map((h, i) => {
    const li = document.createElement("li");
    li.id = String.fromCharCode(97 + i);
    li.dataset.h = String(h);
    return li;
  });
  root.append(...items);
  document.body.append(root);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === root) {
      const kids = [...root.children].filter((el) => inFlow(el as HTMLElement)) as HTMLElement[];
      const total = kids.reduce((sum, el) => sum + heightOf(el), 0);
      return new DOMRect(0, 0, WIDTH, root.style.height ? pixels(root.style.height) : total);
    }
    if (this.parentElement === root) {
      const { x, y } = offset(this);
      if (!inFlow(this))
        return new DOMRect(pixels(this.style.left) + x, pixels(this.style.top) + y, WIDTH, heightOf(this));
      let top = 0;
      for (const el of root.children) {
        if (el === this) break;
        if (inFlow(el as HTMLElement)) top += heightOf(el as HTMLElement);
      }
      return new DOMRect(x, top + y, widthOf(this), heightOf(this));
    }
    return new DOMRect(0, 0, 0, 0);
  });
  return { root, items };
}

const quick = { duration: 0.1, bounce: 0 };
/** Its observers heard: mutations are told in a microtask */
const seen = () => Promise.resolve();
const settle = () => vi.advanceTimersByTime(2000);
const make = (root: HTMLElement, options: Partial<LayoutOptions> = {}) =>
  createLayout({ root, spring: quick, ...options });
const li = (id: string, h = 40) => {
  const el = document.createElement("li");
  el.id = id;
  el.dataset.h = String(h);
  return el;
};

describe("createLayout", () => {
  it("leaves the items there when it's made as they are", () => {
    const { root, items } = list([40, 40, 40]);
    const layout = make(root);
    expect(layout.moving).toBe(false);
    for (const el of [root, ...items]) expect(el.getAttribute("style")).toBeNull();
  });

  it("shows the items after one put in where they were, and moves them; the new one comes in", async () => {
    const { root, items } = list([40, 40, 40]);
    const onStart = vi.fn();
    const onRest = vi.fn();
    const layout = make(root, { onStart, onRest });
    const [a, b, c] = items;
    const n = li("n", 30);
    b.before(n);
    await seen();
    expect(layout.moving).toBe(true);
    expect(offset(a)).toEqual({ x: 0, y: 0 });
    expect(offset(b).y).toBeCloseTo(-30);
    expect(offset(c).y).toBeCloseTo(-30);
    expect(Number(n.style.opacity)).toBeLessThan(0.05);
    expect(n.style.scale).toMatch(/^0\.96/);
    // The root grows from its height before
    expect(root.style.height).toBe("120px");
    vi.advanceTimersByTime(50);
    expect(offset(b).y).toBeGreaterThan(-30);
    expect(offset(b).y).toBeLessThan(0);
    settle();
    expect(layout.moving).toBe(false);
    for (const el of [root, a, b, c, n]) expect(el.getAttribute("style") ?? "").toBe("");
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it("puts one taken out back where it was while it goes out, then removes it", async () => {
    const { root, items } = list([40, 40, 40]);
    const onStart = vi.fn();
    make(root, { onStart });
    const [, b, c] = items;
    b.remove();
    await seen();
    expect(b.isConnected).toBe(true);
    expect(b.nextElementSibling).toBe(c);
    expect(b.hasAttribute("data-fk-part")).toBe(true);
    expect(b.getAttribute("aria-hidden")).toBe("true");
    expect(b.inert).toBe(true);
    expect(b.style.position).toBe("absolute");
    expect(b.style.top).toBe("40px");
    expect(offset(c).y).toBeCloseTo(40);
    settle();
    await seen();
    expect(b.isConnected).toBe(false);
    expect(c.getAttribute("style") ?? "").toBe("");
    // Putting it back and taking it out again were the layout's own: nothing else set off
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("keeps one the page puts back while it goes out", async () => {
    const { root, items } = list([40, 40, 40]);
    make(root);
    const [, b] = items;
    b.remove();
    await seen();
    vi.advanceTimersByTime(30);
    root.append(b);
    await seen();
    settle();
    await seen();
    expect(b.isConnected).toBe(true);
    expect(b.parentElement).toBe(root);
    expect(b.hasAttribute("data-fk-part")).toBe(false);
    expect(b.inert).toBe(false);
    expect(b.getAttribute("style") ?? "").toBe("");
  });

  it("changes a size for real: held where it was, let go at rest", async () => {
    const { root, items } = list([40, 40, 40]);
    make(root);
    const [, b, c] = items;
    b.classList.add("open");
    await seen();
    expect(b.style.height).toBe("40px");
    expect(b.style.overflowY).toBe("clip");
    expect(b.style.boxSizing).toBe("border-box");
    // What comes after it moves by the layout itself, not shown elsewhere
    expect(offset(c).y).toBeCloseTo(0);
    vi.advanceTimersByTime(50);
    expect(pixels(b.style.height)).toBeGreaterThan(40);
    expect(pixels(b.style.height)).toBeLessThan(80);
    settle();
    expect(b.getAttribute("style") ?? "").toBe("");
    expect(root.getAttribute("style") ?? "").toBe("");
  });

  it("holds a width in a flex row against the flex, and leaves the flex alone for a height", async () => {
    const { root, items } = list([40, 40]);
    root.style.display = "flex";
    make(root);
    const [a, b] = items;
    a.style.flex = "1";
    a.dataset.w = "120";
    b.classList.add("open");
    await seen();
    expect(a.style.width).toBe("300px");
    expect(a.style.flexBasis).toBe("auto");
    expect(a.style.flexGrow).toBe("0");
    expect(b.style.height).toBe("40px");
    expect(b.style.flexGrow).toBe("");
    settle();
    // Its own flex as it was (`1` is `1 1 0%`)
    expect([a.style.flexGrow, a.style.flexBasis]).toEqual(["1", "0%"]);
    expect(a.style.width).toBe("");
  });

  it("moves only positions with `size: false`", async () => {
    const { root, items } = list([40, 40, 40]);
    make(root, { size: false });
    const [, b, c] = items;
    b.classList.add("open");
    await seen();
    expect(b.style.height).toBe("");
    expect(root.style.height).toBe("");
    expect(offset(c).y).toBeCloseTo(-40);
  });

  it("turned around on the way, sets off again from where it's drawn", async () => {
    const { root, items } = list([40, 40, 40]);
    make(root);
    const [a, , c] = items;
    root.append(a);
    await seen();
    expect(offset(a).y).toBeCloseTo(-80);
    vi.advanceTimersByTime(60);
    const mid = offset(a).y;
    expect(mid).toBeGreaterThan(-80);
    root.prepend(a);
    await seen();
    // From where it was drawn, not from either end
    expect(offset(a).y).toBeCloseTo(80 + mid, 0);
    expect(offset(c).y).not.toBe(0);
    settle();
    expect(a.getAttribute("style") ?? "").toBe("");
  });

  it("comes in and goes out as a transition has it: blurred on a layer of its own, moved, all put back", async () => {
    const { root, items } = list([40, 40, 40]);
    make(root, { enter: transitions.blurReplace(), exit: transitions.move({ y: 12 }) });
    const n = li("n");
    n.style.filter = "brightness(0.5)";
    items[1].before(n);
    await seen();
    // Its own filter first, then the blur
    expect(n.style.filter).toBe("brightness(0.5) blur(8px)");
    expect(n.style.willChange).toBe("filter");
    expect(n.style.scale).toMatch(/^0\.9/);
    vi.advanceTimersByTime(40);
    expect(parseFloat(/blur\(([\d.]+)px\)/.exec(n.style.filter)![1])).toBeLessThan(8);
    settle();
    expect(n.getAttribute("style")).toBe("filter: brightness(0.5);");
    // Going out it fades moving down, from where it was
    const c = items[2];
    c.remove();
    await seen();
    expect(offset(c).y).toBeCloseTo(0);
    vi.advanceTimersByTime(40);
    expect(offset(c).y).toBeGreaterThan(0);
    expect(offset(c).y).toBeLessThan(12);
    expect(c.style.filter).toBe("");
  });

  it("turned around coming in, sets off from where it's laid out, not where it's drawn moved", async () => {
    const { root } = list([40, 40]);
    make(root, { enter: transitions.move({ y: 12 }) });
    const n = li("n");
    root.prepend(n);
    await seen();
    vi.advanceTimersByTime(30);
    // What's left of coming in, and nothing else: it was put in where it is
    const left = offset(n).y;
    expect(left).toBeGreaterThan(0);
    root.append(n);
    await seen();
    // From the top (0) to the bottom (80), coming in as far as it had
    expect(offset(n).y).toBeCloseTo(-80 + left, 0);
  });

  it("comes in and goes out at once with `enter` and `exit` off", async () => {
    const { root, items } = list([40, 40]);
    make(root, { enter: false, exit: false });
    const n = li("n");
    root.append(n);
    await seen();
    expect(n.style.opacity).toBe("");
    items[0].remove();
    await seen();
    expect(items[0].isConnected).toBe(false);
  });

  it("doesn't move an item being dragged", async () => {
    const { root, items } = list([40, 40, 40]);
    make(root);
    items[2].setAttribute("data-dragging", "");
    items[0].before(li("n"));
    await seen();
    expect(items[2].style.translate).toBe("");
    expect(offset(items[1]).y).toBeCloseTo(-40);
  });

  it("adds to an item's own translation, and leaves its transform alone", async () => {
    const { root, items } = list([40, 40]);
    make(root);
    const b = items[1];
    b.style.translate = "10px 0px";
    b.style.transform = "rotate(1deg)";
    items[0].before(li("n"));
    await seen();
    expect(b.style.translate).toMatch(/calc\(10px \+ -?[\d.]+px\)/);
    expect(b.style.transform).toBe("rotate(1deg)");
    settle();
    expect(b.style.translate).toBe("10px 0px");
    expect(b.style.transform).toBe("rotate(1deg)");
  });

  it("follows a change no watcher sees on `update()`", () => {
    const { root, items } = list([40, 40]);
    const layout = make(root, { size: false });
    items[0].dataset.h = "60";
    layout.update();
    expect(offset(items[1]).y).toBeCloseTo(-20);
  });

  it("changes everything at once with reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { root, items } = list([40, 40]);
    make(root);
    items[0].before(li("n"));
    items[1].classList.add("open");
    await seen();
    for (const el of [root, ...root.children]) expect(el.getAttribute("style") ?? "").toBe("");
  });

  it("changes everything at once while the root is hidden, and as it's shown again", async () => {
    const { root, items } = list([40, 40, 40]);
    const onRest = vi.fn();
    const layout = make(root, { onRest });
    const [a, b, c] = items;
    const box = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    const laidOut = box.getMockImplementation()!;
    const hide = () => {
      vi.spyOn(root, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
      box.mockImplementation(() => new DOMRect());
    };
    const show = () => {
      vi.mocked(root.getClientRects).mockRestore();
      box.mockImplementation(laidOut);
    };
    // Hidden on the way: it all lands
    root.append(a);
    await seen();
    expect(layout.moving).toBe(true);
    hide();
    layout.update();
    expect(layout.moving).toBe(false);
    expect(onRest).toHaveBeenCalledTimes(1);
    // Taken out meanwhile: just gone
    b.remove();
    await seen();
    expect(b.isConnected).toBe(false);
    // Shown again: everything where it is, nothing coming from where it was hidden
    show();
    layout.update();
    expect(layout.moving).toBe(false);
    for (const el of [root, ...root.children]) expect(el.getAttribute("style") ?? "").toBe("");
    // And from there on it moves again
    c.before(li("n"));
    await seen();
    expect(offset(a).y).toBeCloseTo(-40);
  });

  it("puts everything back when destroyed on the way", async () => {
    const { root, items } = list([40, 40, 40]);
    const layout = make(root);
    items[1].remove();
    items[0].classList.add("open");
    await seen();
    layout.destroy();
    expect(items[1].isConnected).toBe(false);
    for (const el of [root, ...root.children]) expect(el.getAttribute("style") ?? "").toBe("");
    // Not watching any more
    root.prepend(li("n"));
    await seen();
    expect(items[0].style.translate).toBe("");
  });

  it("takes new settings", async () => {
    const { root, items } = list([40, 40]);
    const layout = make(root);
    layout.set({ enter: false });
    const n = li("n");
    root.append(n);
    await seen();
    expect(n.style.opacity).toBe("");
    expect(items[0].style.translate).toBe("");
  });
});

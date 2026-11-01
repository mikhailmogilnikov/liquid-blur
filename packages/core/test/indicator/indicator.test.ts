import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createIndicator, type IndicatorOptions } from "../../src/indicator/index";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * A 200px wide menu: the indicator, then rows 40px high with an 8px gap, each row's box given. A
 * separator can come after one of them (taking its gap), and any can be disabled.
 */
function menu({ rows = 3, separatorAfter = -1, disabled = -1, radius = "20px" } = {}) {
  const container = document.createElement("div");
  container.getBoundingClientRect = () => new DOMRect(0, 0, 200, 200);
  const indicator = document.createElement("span");
  indicator.style.borderRadius = "10px";
  container.append(indicator);
  const items: HTMLButtonElement[] = [];
  for (let i = 0; i < rows; i++) {
    const item = document.createElement("button");
    item.style.borderRadius = radius;
    const y = i * 48;
    item.getBoundingClientRect = () => new DOMRect(0, y, 200, 40);
    if (i === disabled) item.setAttribute("aria-disabled", "true");
    container.append(item);
    items.push(item);
    if (i === separatorAfter) {
      const hr = document.createElement("hr");
      hr.getBoundingClientRect = () => new DOMRect(0, y + 42, 200, 4);
      container.append(hr);
    }
  }
  document.body.append(container);
  return { container, indicator, items };
}

function pointer(el: Element, type: string, x: number, y: number, pointerType = "mouse", buttons = 1) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      button: 0,
      buttons,
      pointerId: 1,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
}

/** Its box as drawn: top left corner and size */
const drawn = (el: HTMLElement) => ({
  transform: el.style.transform,
  width: el.style.width,
  height: el.style.height,
});
const at = (y: number) => ({ transform: `translate(0px, ${y}px)`, width: "200px", height: "40px" });
const settle = () => vi.advanceTimersByTime(600);
const create = (scene: ReturnType<typeof menu>, options: Partial<IndicatorOptions> = {}) =>
  createIndicator({ container: scene.container, indicator: scene.indicator, ...options });

describe("createIndicator", () => {
  it("needs the indicator inside its container", () => {
    const scene = menu();
    expect(() => createIndicator({ container: scene.container, indicator: document.createElement("span") })).toThrow();
  });

  it("rests on the chosen item from the start, with its corners", () => {
    const scene = menu();
    const indicator = create(scene, { rest: scene.items[1] });
    expect(indicator.current).toBe(scene.items[1]);
    expect(drawn(scene.indicator)).toEqual(at(48));
    expect(scene.indicator.style.borderRadius).toBe("20px");
    expect(scene.indicator.style.visibility).toBe("");
    expect(scene.indicator.style.opacity).toBe("1");
  });

  it("is away without a rest", () => {
    const scene = menu();
    const indicator = create(scene);
    expect(indicator.current).toBeNull();
    expect(scene.indicator.style.visibility).toBe("hidden");
    expect(scene.indicator.style.opacity).toBe("0");
  });

  it("marks itself a part while it runs, and gives everything back on destroy", () => {
    const scene = menu();
    const indicator = create(scene, { rest: scene.items[0] });
    expect(scene.indicator.hasAttribute("data-fk-part")).toBe(true);
    expect(scene.indicator.getAttribute("aria-hidden")).toBe("true");
    indicator.destroy();
    expect(scene.indicator.getAttribute("style")).toBe("border-radius: 10px;");
    expect(scene.indicator.hasAttribute("data-fk-part")).toBe(false);
    expect(scene.indicator.hasAttribute("aria-hidden")).toBe(false);
    indicator.destroy();
  });

  it("takes an item's corners fitted, and its own from a square item", () => {
    const capsule = menu({ radius: "999px" });
    create(capsule, { rest: capsule.items[0] });
    expect(capsule.indicator.style.borderRadius).toBe("20px");
    const square = menu({ radius: "0px" });
    create(square, { rest: square.items[0] });
    expect(square.indicator.style.borderRadius).toBe("10px");
  });

  it("leaves separators out of its items", () => {
    const scene = menu({ separatorAfter: 0 });
    const indicator = create(scene, { trigger: "manual" });
    indicator.to(scene.container.querySelector("hr"), { instant: true });
    expect(indicator.current).toBeNull();
  });

  it("takes its items from a selector when given one", () => {
    const scene = menu();
    scene.items[1].classList.add("only");
    const indicator = create(scene, { trigger: "manual", items: ".only" });
    indicator.to(scene.items[0]);
    expect(indicator.current).toBeNull();
    indicator.to(scene.items[1]);
    expect(indicator.current).toBe(scene.items[1]);
  });

  describe("hovering", () => {
    it("follows the mouse from item to item, staying put over gaps and separators", () => {
      const scene = menu({ separatorAfter: 1 });
      const changes: (HTMLElement | null)[] = [];
      const indicator = create(scene, { onChange: (item) => changes.push(item) });
      pointer(scene.items[0], "pointermove", 100, 20);
      expect(indicator.current).toBe(scene.items[0]);
      // In the gap under the first row, then over the separator: it stays where it was
      pointer(scene.container, "pointermove", 100, 44);
      expect(indicator.current).toBe(scene.items[0]);
      pointer(scene.items[1], "pointermove", 100, 60);
      pointer(scene.container, "pointermove", 100, 92);
      expect(indicator.current).toBe(scene.items[1]);
      pointer(scene.items[2], "pointermove", 100, 110);
      settle();
      expect(indicator.current).toBe(scene.items[2]);
      expect(drawn(scene.indicator)).toEqual(at(96));
      expect(changes).toEqual([scene.items[0], scene.items[1], scene.items[2]]);
    });

    it("shows up on its item at once, and fades going away where it was headed", () => {
      const scene = menu();
      create(scene);
      pointer(scene.items[1], "pointermove", 100, 60);
      vi.advanceTimersByTime(16);
      expect(drawn(scene.indicator)).toEqual(at(48));
      expect(scene.indicator.style.opacity).toBe("1");
      // On its way to the third row when the pointer leaves: it lands there as it fades
      pointer(scene.items[2], "pointermove", 100, 110);
      vi.advanceTimersByTime(16);
      scene.container.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse", pointerId: 1 }));
      settle();
      expect(drawn(scene.indicator)).toEqual(at(96));
      expect(scene.indicator.style.visibility).toBe("hidden");
    });

    it("goes away over a disabled item", () => {
      const scene = menu({ disabled: 1 });
      const indicator = create(scene);
      pointer(scene.items[0], "pointermove", 100, 20);
      pointer(scene.items[1], "pointermove", 100, 60);
      expect(indicator.current).toBeNull();
    });

    it("goes back to its rest when the pointer leaves", () => {
      const scene = menu();
      const indicator = create(scene, { rest: scene.items[0] });
      pointer(scene.items[2], "pointermove", 100, 110);
      expect(indicator.current).toBe(scene.items[2]);
      scene.container.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse", pointerId: 1 }));
      expect(indicator.current).toBe(scene.items[0]);
    });

    it("ignores a finger", () => {
      const scene = menu();
      const indicator = create(scene, { trigger: "hover" });
      pointer(scene.items[0], "pointerdown", 100, 20, "touch");
      vi.advanceTimersByTime(100);
      pointer(scene.items[0], "pointermove", 100, 20, "touch");
      expect(indicator.current).toBeNull();
    });

    it("is pressed while the mouse is down on its item", () => {
      const scene = menu();
      create(scene);
      pointer(scene.items[0], "pointermove", 100, 20);
      pointer(scene.items[0], "pointerdown", 100, 20);
      expect(scene.indicator.hasAttribute("data-pressed")).toBe(true);
      pointer(scene.items[0], "pointerup", 100, 20);
      expect(scene.indicator.hasAttribute("data-pressed")).toBe(false);
    });
  });

  describe("pressing", () => {
    it("shows under a finger after a short delay, and clicks the item it's released on", () => {
      const scene = menu();
      const indicator = create(scene);
      const clicks: string[] = [];
      scene.items.forEach((item, i) => item.addEventListener("click", () => clicks.push(`item ${i}`)));
      scene.container.addEventListener("click", () => clicks.push("container"));
      pointer(scene.items[0], "pointerdown", 100, 20, "touch");
      expect(indicator.current).toBeNull();
      vi.advanceTimersByTime(80);
      expect(indicator.current).toBe(scene.items[0]);
      expect(scene.indicator.hasAttribute("data-pressed")).toBe(true);
      // The finger is captured by the item it went down on; the move is still over the third
      pointer(scene.items[0], "pointermove", 100, 110, "touch");
      expect(indicator.current).toBe(scene.items[2]);
      pointer(scene.items[0], "pointerup", 100, 110, "touch");
      expect(scene.indicator.hasAttribute("data-pressed")).toBe(false);
      // The browser's own click, on an ancestor of both, is dropped
      scene.container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(clicks).toEqual(["item 2", "container"]);
      vi.advanceTimersByTime(16);
      expect(indicator.current).toBeNull();
    });

    it("shows nothing for a quick tap and leaves its click to the browser", () => {
      const scene = menu();
      const indicator = create(scene);
      let clicks = 0;
      scene.items[0].addEventListener("click", () => clicks++);
      pointer(scene.items[0], "pointerdown", 100, 20, "touch");
      vi.advanceTimersByTime(30);
      pointer(scene.items[0], "pointerup", 100, 20, "touch");
      expect(indicator.current).toBeNull();
      expect(clicks).toBe(0);
    });

    it("hides when the press is cancelled, a finger starting a scroll", () => {
      const scene = menu();
      const indicator = create(scene);
      pointer(scene.items[0], "pointerdown", 100, 20, "touch");
      vi.advanceTimersByTime(80);
      pointer(scene.items[0], "pointercancel", 100, 20, "touch");
      expect(indicator.current).toBeNull();
    });

    it("holds the page's text selection while a press goes across the items", () => {
      const scene = menu();
      create(scene, { trigger: "press" });
      const root = document.documentElement.style;
      pointer(scene.items[0], "pointerdown", 100, 20);
      expect(root.userSelect).toBe("none");
      pointer(document.body, "pointerup", 100, 20);
      expect(root.userSelect).toBe("");
    });

    it("follows a mouse press out of the container and back", () => {
      const scene = menu();
      const indicator = create(scene, { trigger: "press" });
      pointer(scene.items[0], "pointerdown", 100, 20);
      expect(indicator.current).toBe(scene.items[0]);
      // Out of the items it stays; back over one it's there
      pointer(document.body, "pointermove", 400, 300);
      expect(indicator.current).toBe(scene.items[0]);
      pointer(document.body, "pointermove", 100, 60);
      expect(indicator.current).toBe(scene.items[1]);
      pointer(document.body, "pointerup", 100, 60);
    });

    it("ends a press the browser took over without a choice", () => {
      const scene = menu();
      const indicator = create(scene, { trigger: "press", rest: scene.items[0] });
      let clicks = 0;
      scene.items[2].addEventListener("click", () => clicks++);
      // A drag of selected text: the release never comes, the mouse moves on with no button down
      pointer(scene.items[1], "pointerdown", 100, 60);
      expect(indicator.current).toBe(scene.items[1]);
      pointer(document.body, "pointermove", 100, 110, "mouse", 0);
      expect(indicator.current).toBe(scene.items[0]);
      expect(scene.indicator.hasAttribute("data-pressed")).toBe(false);
      // And a native drag ends it the same way
      pointer(scene.items[1], "pointerdown", 100, 60);
      document.dispatchEvent(new Event("dragstart"));
      expect(indicator.current).toBe(scene.items[0]);
      expect(clicks).toBe(0);
    });
  });

  describe("by hand", () => {
    it("goes where it's sent, away with null, at once when asked", () => {
      const scene = menu();
      const indicator = create(scene, { trigger: "manual" });
      indicator.to(scene.items[2], { instant: true });
      expect(drawn(scene.indicator)).toEqual(at(96));
      indicator.to(null);
      settle();
      expect(scene.indicator.style.visibility).toBe("hidden");
    });

    it("goes to a new rest unless something points at it", () => {
      const scene = menu();
      const indicator = create(scene, { rest: scene.items[0] });
      indicator.rest = scene.items[1];
      expect(indicator.current).toBe(scene.items[1]);
      pointer(scene.items[2], "pointermove", 100, 110);
      indicator.rest = scene.items[0];
      expect(indicator.current).toBe(scene.items[2]);
    });

    it("follows an item that moved on update()", () => {
      const scene = menu();
      const indicator = create(scene, { rest: scene.items[0] });
      scene.items[0].getBoundingClientRect = () => new DOMRect(0, 20, 200, 40);
      indicator.update();
      settle();
      expect(drawn(scene.indicator)).toEqual(at(20));
    });

    it("moves at once with reduced motion", () => {
      vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
      const scene = menu();
      const indicator = create(scene, { trigger: "manual", rest: scene.items[0] });
      indicator.to(scene.items[2]);
      expect(drawn(scene.indicator)).toEqual(at(96));
    });
  });
});

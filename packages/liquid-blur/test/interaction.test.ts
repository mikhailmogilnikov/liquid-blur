import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLiquidBlur } from "../src/interaction";

let uninstall: () => void;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  uninstall = installLiquidBlur();
});
afterEach(() => {
  uninstall();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** A 100×40 glass button at the top left of the viewport. */
function glass(classes: string) {
  const el = document.createElement("button");
  el.className = `lb ${classes}`;
  el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 40);
  el.setPointerCapture = () => {};
  document.body.append(el);
  return el;
}

function pointer(el: Element, type: string, x: number, y: number, pointerType = "mouse") {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      button: 0,
      pointerId: 1,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
}

function key(el: Element, type: "keydown" | "keyup", key: string) {
  el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, composed: true, key }));
}

const pressed = (el: Element) => el.hasAttribute("data-lb-pressed");

describe("installLiquidBlur", () => {
  it("marks the root while installed and installs once", () => {
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(true);
    expect(installLiquidBlur()).toBe(uninstall);
    uninstall();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(false);
    uninstall = installLiquidBlur();
  });

  it("does nothing for a document without a window", () => {
    const detached = document.implementation.createHTMLDocument();
    installLiquidBlur(detached)();
    expect(detached.documentElement.hasAttribute("data-lb-interaction")).toBe(false);
  });

  it("presses while the mouse is down", () => {
    const el = glass("lb-highlight");
    pointer(el, "pointerdown", 50, 20);
    expect(pressed(el)).toBe(true);
    pointer(el, "pointerup", 50, 20);
    expect(pressed(el)).toBe(false);
  });

  it("captures the mouse on the glass, but not over a control inside it", () => {
    const bar = glass("lb-highlight");
    const capture = vi.fn();
    bar.setPointerCapture = capture;
    const inner = document.createElement("button");
    bar.append(inner);

    pointer(inner, "pointerdown", 50, 20);
    expect(pressed(bar)).toBe(true);
    expect(capture).not.toHaveBeenCalled();
    pointer(inner, "pointerup", 50, 20);

    pointer(bar, "pointerdown", 50, 20);
    expect(capture).toHaveBeenCalledTimes(1);
    pointer(bar, "pointerup", 50, 20);
  });

  it("cancels the click when released outside, as on iOS", () => {
    const el = glass("lb-highlight");
    const onClick = vi.fn();
    el.addEventListener("click", onClick);

    pointer(el, "pointerdown", 50, 20);
    pointer(el, "pointermove", 400, 400);
    pointer(el, "pointerup", 400, 400);
    el.click();
    expect(onClick).not.toHaveBeenCalled();

    pointer(el, "pointerdown", 50, 20);
    pointer(el, "pointermove", 110, 50); // within the margin
    pointer(el, "pointerup", 110, 50);
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a touch press after a delay, and not at all for a scroll", () => {
    const el = glass("lb-highlight");
    pointer(el, "pointerdown", 50, 20, "touch");
    expect(pressed(el)).toBe(false);
    vi.advanceTimersByTime(100);
    expect(pressed(el)).toBe(true);
    pointer(el, "pointerup", 50, 20, "touch");

    pointer(el, "pointerdown", 50, 20, "touch");
    pointer(el, "pointercancel", 50, 20, "touch");
    vi.advanceTimersByTime(200);
    expect(pressed(el)).toBe(false);
  });

  it("flashes a tap shorter than the touch delay", () => {
    const el = glass("lb-highlight");
    pointer(el, "pointerdown", 50, 20, "touch");
    pointer(el, "pointerup", 50, 20, "touch");
    expect(pressed(el)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(pressed(el)).toBe(false);
  });

  it("releases a key press only on the same key", () => {
    const el = glass("lb-highlight");
    key(el, "keydown", "Enter");
    expect(pressed(el)).toBe(true);
    key(el, "keyup", "Shift");
    expect(pressed(el)).toBe(true);
    key(el, "keyup", "Enter");
    expect(pressed(el)).toBe(false);
  });

  it("releases everything when the window loses focus", () => {
    const keyed = glass("lb-highlight");
    key(keyed, "keydown", " ");
    window.dispatchEvent(new Event("blur"));
    expect(pressed(keyed)).toBe(false);

    const held = glass("lb-swell");
    pointer(held, "pointerdown", 50, 20);
    window.dispatchEvent(new Event("blur"));
    expect(pressed(held)).toBe(false);
  });

  it("animates the light and removes its inline values once it rests", () => {
    const el = glass("lb-highlight");
    pointer(el, "pointerdown", 25, 10);
    vi.advanceTimersByTime(100);
    expect(Number(el.style.getPropertyValue("--_lb-pressed"))).toBeGreaterThan(0.5);
    expect(el.style.getPropertyValue("--lb-press-x")).toBe("25.00%");

    pointer(el, "pointerup", 25, 10);
    vi.advanceTimersByTime(2000);
    expect(el.style.getPropertyValue("--_lb-pressed")).toBe("");
    expect(el.style.getPropertyValue("--lb-press-x")).toBe("");
    expect(el.style.getPropertyValue("--_lb-press-r")).toBe("");
  });

  it("swells and gives the element its own scale back", () => {
    const el = glass("lb-swell");
    el.style.scale = "2";
    pointer(el, "pointerdown", 50, 20);
    vi.advanceTimersByTime(1000);
    expect(el.style.scale).not.toBe("2");
    pointer(el, "pointerup", 50, 20);
    vi.advanceTimersByTime(2000);
    expect(el.style.scale).toBe("2");
  });

  it("puts the light under the finger on a scaled, swelling element", () => {
    const el = glass("lb-highlight lb-swell");
    el.style.scale = "1.5";
    // A 100×40 layout box at the origin, scaled around its center like the real thing
    Object.defineProperty(el, "offsetWidth", { value: 100 });
    Object.defineProperty(el, "offsetHeight", { value: 40 });
    el.getBoundingClientRect = () => {
      const k = Number.parseFloat(el.style.scale) || 1;
      return new DOMRect(50 - 50 * k, 20 - 20 * k, 100 * k, 40 * k);
    };
    const at = (fx: number, fy: number) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width * fx, r.top + r.height * fy] as const;
    };
    const light = () =>
      ["--lb-press-x", "--lb-press-y"].map((name) => Number.parseFloat(el.style.getPropertyValue(name)));

    pointer(el, "pointerdown", ...at(0.1, 0.25));
    expect(light()).toEqual([10, 25]);

    vi.advanceTimersByTime(1000); // fully swollen
    pointer(el, "pointermove", ...at(0.9, 0.75));
    vi.advanceTimersByTime(20);
    const [x, y] = light();
    expect(x).toBeCloseTo(90, 0);
    expect(y).toBeCloseTo(75, 0);
    pointer(el, "pointerup", ...at(0.9, 0.75));
  });

  it("gives less and bounces less the bigger the glass", () => {
    const sized = (width: number, height: number) => {
      const el = glass("lb-stretch");
      el.style.setProperty("--lb-stretch", "2");
      el.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
      return el;
    };
    const offsetX = (el: HTMLElement) => Number(/translate\((-?[\d.]+)px/.exec(el.style.transform)?.[1] ?? 0);

    /** Pulls 100px to the right, holds, lets go; returns the pull and how far it swung past rest */
    const fling = (el: HTMLElement, id: number) => {
      const at = (type: string, x: number) =>
        el.dispatchEvent(
          new PointerEvent(type, { bubbles: true, composed: true, button: 0, pointerId: id, pointerType: "mouse", clientX: x, clientY: 10 }),
        );
      at("pointerdown", 10);
      at("pointermove", 110);
      vi.advanceTimersByTime(1000);
      const pull = offsetX(el);
      at("pointerup", 110);
      let swing = 0;
      for (let t = 0; t < 2000; t += 16) {
        vi.advanceTimersByTime(16);
        swing = Math.min(swing, offsetX(el));
      }
      return { pull, swing: -swing };
    };

    const chip = fling(sized(44, 44), 1);
    const panel = fling(sized(600, 400), 2);
    expect(chip.pull).toBeGreaterThan(panel.pull * 2);
    expect(chip.swing / chip.pull).toBeGreaterThan(panel.swing / panel.pull);
  });

  it("swells small glass more than big glass", () => {
    const swelled = (width: number, height: number) => {
      const el = glass("lb-swell");
      el.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
      pointer(el, "pointerdown", 10, 10);
      vi.advanceTimersByTime(1500);
      const scale = Number.parseFloat(el.style.scale);
      pointer(el, "pointerup", 10, 10);
      return scale;
    };
    const chip = swelled(44, 44);
    const card = swelled(320, 120);
    const panel = swelled(600, 400);
    expect(chip).toBeGreaterThan(1.1);
    expect(card).toBeLessThan(1.1);
    expect(panel).toBeLessThan(card);
    expect(panel).toBeGreaterThan(1);
  });

  it("sizes the light to the element, within limits", () => {
    const reach = (width: number, height: number, via: "pointer" | "key" = "pointer") => {
      const el = glass("lb-highlight");
      el.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
      if (via === "pointer") pointer(el, "pointerdown", 5, 5);
      else key(el, "keydown", "Enter");
      const r = Number.parseFloat(el.style.getPropertyValue("--_lb-press-r"));
      if (via === "pointer") pointer(el, "pointerup", 5, 5);
      else key(el, "keyup", "Enter");
      return r;
    };
    expect(reach(44, 44)).toBe(48.4);
    expect(reach(44, 160)).toBeCloseTo(92.3, 0);
    expect(reach(600, 400)).toBe(220);
    expect(reach(20, 20)).toBe(48);
    expect(reach(44, 160, "key")).toBeCloseTo(92.3, 0);
  });

  it("stretches toward the drag and restores the transform", () => {
    const el = glass("lb-stretch");
    el.style.setProperty("--lb-stretch", "2");
    el.style.transform = "rotate(1deg)";
    pointer(el, "pointerdown", 50, 20);
    pointer(el, "pointermove", 150, 20);
    vi.advanceTimersByTime(500);
    expect(el.style.transform).toMatch(/translate\(\d/);
    pointer(el, "pointerup", 150, 20);
    vi.advanceTimersByTime(3000);
    expect(el.style.transform).toBe("rotate(1deg)");
  });
});

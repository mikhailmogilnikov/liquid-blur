import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createLift, type LiftOptions } from "../../src/lift/index";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => {
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, isPrimary: true }));
  vi.advanceTimersByTime(2000);
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A 100 × 100 photo at (x, y), and a 200 × 150 menu of three items, hidden */
function scene({ x = 100, y = 100 } = {}) {
  const photo = document.createElement("div");
  photo.getBoundingClientRect = () => new DOMRect(x, y, 100, 100);
  const menu = document.createElement("div");
  menu.hidden = true;
  Object.defineProperty(menu, "offsetWidth", { value: 200 });
  Object.defineProperty(menu, "offsetHeight", { value: 150 });
  const items = ["Copy", "Share", "Delete"].map((label) => {
    const button = document.createElement("button");
    button.textContent = label;
    menu.append(button);
    return button;
  });
  document.body.append(photo, menu);
  return { photo, menu, items };
}

function pointer(target: EventTarget, type: string, x: number, y: number, pointerType = "mouse") {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pointerId: 1,
      pointerType,
      isPrimary: true,
      clientX: x,
      clientY: y,
    }),
  );
}

const layer = () => document.querySelector<HTMLDialogElement>("dialog[data-fk-lift]");
const make = (s: ReturnType<typeof scene>, options: Partial<LiftOptions> = {}) =>
  createLift({ element: s.photo, menu: s.menu, ...options });

describe("createLift", () => {
  it("lifts on a press held still, its menu moved in and shown, the element hidden in place", () => {
    const s = scene();
    const onOpen = vi.fn();
    const lift = make(s, { onOpen });
    pointer(s.photo, "pointerdown", 150, 150);
    expect(s.photo.hasAttribute("data-lifting")).toBe(true);
    vi.advanceTimersByTime(499);
    expect(layer()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(lift.opened).toBe(true);
    expect(layer()?.open).toBe(true);
    expect(layer()?.contains(s.menu)).toBe(true);
    expect(s.menu.hidden).toBe(false);
    expect(s.photo.style.visibility).toBe("hidden");
    expect(s.photo.hasAttribute("data-lifted")).toBe(true);
    expect(s.photo.hasAttribute("data-lifting")).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("lifts a copy: over the element, no ids, inert, marked lifted", () => {
    const s = scene();
    s.photo.id = "photo";
    s.photo.innerHTML = '<span id="inner">A</span>';
    make(s).open();
    const copy = layer()!.children[1] as HTMLElement;
    expect(copy).not.toBe(s.photo);
    expect(copy.id).toBe("");
    expect(copy.querySelector("[id]")).toBeNull();
    expect(copy.inert).toBe(true);
    expect(copy.hasAttribute("data-lifted")).toBe(true);
    expect(copy.style.left).toBe("100px");
    expect(copy.style.width).toBe("100px");
  });

  it("doesn't lift on a quick tap, or a press that moves", () => {
    const s = scene();
    make(s);
    pointer(s.photo, "pointerdown", 150, 150);
    vi.advanceTimersByTime(200);
    pointer(s.photo, "pointerup", 150, 150);
    vi.advanceTimersByTime(600);
    expect(layer()).toBeNull();
    pointer(s.photo, "pointerdown", 150, 150);
    pointer(s.photo, "pointermove", 170, 150);
    vi.advanceTimersByTime(600);
    expect(layer()).toBeNull();
    expect(s.photo.hasAttribute("data-lifting")).toBe(false);
  });

  it("lifts at once on a right click, the browser's own menu not shown", () => {
    const s = scene();
    make(s);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    s.photo.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(layer()?.open).toBe(true);
  });

  it("opens the menu under the element, or over it with no room under", () => {
    const top = scene({ x: 100, y: 100 });
    make(top).open();
    expect(Number.parseFloat(top.menu.style.top)).toBeGreaterThan(200);
    document.body.innerHTML = "";

    const low = scene({ x: 100, y: 600 });
    make(low).open();
    expect(Number.parseFloat(low.menu.style.top) + 150).toBeLessThanOrEqual(600);
  });

  it("puts the menu on the element's side of the screen", () => {
    const left = scene({ x: 100, y: 100 });
    make(left).open();
    expect(left.menu.style.left).toBe("98px");
    document.body.innerHTML = "";

    const right = scene({ x: 800, y: 100 });
    make(right).open();
    // The lifted element's right edge (902px), less the menu's width
    expect(right.menu.style.left).toBe("702px");
  });

  it("chooses an item clicked: told, then closed and everything put back", () => {
    const s = scene();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const lift = make(s, { onSelect, onClose });
    lift.open();
    s.items[1].click();
    expect(onSelect).toHaveBeenCalledWith(s.items[1]);
    vi.advanceTimersByTime(2000);
    expect(lift.opened).toBe(false);
    expect(layer()).toBeNull();
    expect(s.menu.parentElement).toBe(document.body);
    expect(s.menu.hidden).toBe(true);
    expect(s.photo.style.visibility).toBe("");
    expect(s.photo.hasAttribute("data-lifted")).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, and on a press on the dim", () => {
    const s = scene();
    const lift = make(s);
    lift.open();
    layer()!.dispatchEvent(new Event("cancel", { cancelable: true }));
    vi.advanceTimersByTime(2000);
    expect(lift.opened).toBe(false);
    lift.open();
    (layer()!.firstElementChild as HTMLElement).click();
    vi.advanceTimersByTime(2000);
    expect(lift.opened).toBe(false);
  });

  it("follows the finger that lifted it onto an item, and chooses it as it's let go", () => {
    const s = scene();
    const onHighlight = vi.fn();
    const onSelect = vi.fn();
    make(s, { onHighlight, onSelect });
    pointer(s.photo, "pointerdown", 150, 150, "touch");
    vi.advanceTimersByTime(500);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(s.items[2]);
    pointer(window, "pointermove", 150, 260, "touch");
    expect(s.items[2].hasAttribute("data-highlighted")).toBe(true);
    expect(onHighlight).toHaveBeenLastCalledWith(s.items[2]);
    pointer(window, "pointerup", 150, 260, "touch");
    expect(onSelect).toHaveBeenCalledWith(s.items[2]);
  });

  it("stays open when the finger lets go where it lifted it", () => {
    const s = scene();
    const lift = make(s);
    pointer(s.photo, "pointerdown", 150, 150, "touch");
    vi.advanceTimersByTime(500);
    pointer(window, "pointerup", 150, 150, "touch");
    vi.advanceTimersByTime(600);
    expect(lift.opened).toBe(true);
  });

  it("holds the page's selection while it's pressed", () => {
    const s = scene();
    make(s);
    pointer(s.photo, "pointerdown", 150, 150);
    expect(document.documentElement.style.userSelect).toBe("none");
    pointer(s.photo, "pointerup", 150, 150);
    expect(document.documentElement.style.userSelect).toBe("");
  });

  it("focuses the first item when opened by hand", () => {
    const s = scene();
    make(s).open();
    expect(document.activeElement).toBe(s.items[0]);
  });

  it("gives everything back on destroy, open or not", () => {
    const s = scene();
    const lift = make(s);
    lift.open();
    lift.destroy();
    expect(layer()).toBeNull();
    expect(s.photo.style.visibility).toBe("");
    expect(s.menu.hidden).toBe(true);
    pointer(s.photo, "pointerdown", 150, 150);
    vi.advanceTimersByTime(600);
    expect(layer()).toBeNull();
    lift.destroy();
  });
});

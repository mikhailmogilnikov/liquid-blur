import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import Probe from "./svelte/Probe.svelte";
import Refusing from "./svelte/Refusing.svelte";
import Sheet from "./svelte/Sheet.svelte";
import { reactive } from "./svelte/state.svelte";
import Unmount from "./svelte/Unmount.svelte";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  // Laid out: the room it moves in 300 × 600, itself 300 × 100 (happy-dom lays nothing out)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
});
afterEach(() => {
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, isPrimary: true }));
  vi.advanceTimersByTime(1000);
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const settle = async (ms = 2000) => {
  flushSync();
  await tick();
  vi.advanceTimersByTime(ms);
  flushSync();
  await tick();
  vi.advanceTimersByTime(ms);
};

function pointer(target: Element, type: string, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: x,
      clientY: y,
    }),
  );
}

/** Dragged from (0, y) by `dy` over `ms`, and let go */
function fling(target: Element, y: number, dy: number, ms = 300) {
  pointer(target, "pointerdown", 0, y);
  for (let i = 1; i <= 10; i++) {
    vi.advanceTimersByTime(ms / 10);
    pointer(target, "pointermove", 0, y + (dy * i) / 10);
  }
  pointer(target, "pointerup", 0, y + dy);
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const offset = (el: HTMLElement) => Number.parseFloat(el.style.translate.split(" ")[1] ?? "0");

describe("Drag (Svelte)", () => {
  it("starts at `defaultSnap`, snap points read from the room it's in", async () => {
    const app = mount(Sheet, { target: document.body, props: { defaultSnap: 1 } });
    await settle();
    expect(offset(byTestId("sheet"))).toBe(300);
    expect(byTestId("sheet").dataset.snap).toBe("1");
    unmount(app);
  });

  it("is dragged by its handle, and tells the snap point it's let go at", async () => {
    const changes: number[] = [];
    const app = mount(Sheet, {
      target: document.body,
      props: { defaultSnap: 1, onSnapChange: (s: number) => changes.push(s) },
    });
    await settle();
    // On the sheet itself, not the handle: nothing
    fling(byTestId("sheet"), 300, 260);
    await settle();
    expect(offset(byTestId("sheet"))).toBe(300);
    fling(byTestId("grabber"), 300, 260);
    await settle();
    expect(changes).toEqual([2]);
    expect(offset(byTestId("sheet"))).toBe(524);
    expect(byTestId("sheet").dataset.snap).toBe("2");
    unmount(app);
  });

  it("follows `snap` from the parent", async () => {
    const props = reactive({ snap: 0 });
    const app = mount(Sheet, { target: document.body, props });
    await settle();
    expect(offset(byTestId("sheet"))).toBe(0);
    props.snap = 2;
    await settle();
    expect(offset(byTestId("sheet"))).toBe(524);
    unmount(app);
  });

  it("goes back when a bound snap says no to the change", async () => {
    const changes: number[] = [];
    const app = mount(Refusing, { target: document.body, props: { changes } });
    await settle();
    fling(byTestId("grabber"), 300, 260);
    await settle();
    expect(changes).toEqual([2]);
    expect(offset(byTestId("sheet"))).toBe(300);
    unmount(app);
  });

  it("follows snap points of the room that change with an update", async () => {
    const props = reactive({ defaultSnap: 1, peek: 76 });
    const app = mount(Sheet, { target: document.body, props });
    await settle();
    expect(offset(byTestId("sheet"))).toBe(300);
    // Now [0, height - 100]: snap point 1 is 500
    props.peek = 100;
    await settle();
    expect(offset(byTestId("sheet"))).toBe(500);
    unmount(app);
  });

  it("takes new options without being made again, and is made again for another axis where it was", async () => {
    const engines = new Set<unknown>();
    const props = reactive<{ axis: "x" | "y"; duration: number; engines: Set<unknown> }>({
      axis: "y",
      duration: 0.4,
      engines,
    });
    const app = mount(Probe, { target: document.body, props });
    await settle();
    props.duration = 0.5;
    await settle();
    expect(engines.size).toBe(1);
    props.axis = "x";
    await settle();
    expect(engines.size).toBe(2);
    expect(byTestId("el").style.translate).toBe("100px 0px");
    unmount(app);
  });

  it("isn't dragged while disabled", async () => {
    const props = reactive({ defaultSnap: 0, disabled: true });
    const app = mount(Sheet, { target: document.body, props });
    await settle();
    fling(byTestId("grabber"), 0, 400);
    await settle();
    expect(offset(byTestId("sheet"))).toBe(0);
    props.disabled = false;
    await settle();
    fling(byTestId("grabber"), 0, 400);
    await settle();
    expect(offset(byTestId("sheet"))).toBeGreaterThan(0);
    unmount(app);
  });

  it("gives its element its own translate back when it goes", async () => {
    const props = reactive({ on: true });
    const app = mount(Unmount, { target: document.body, props });
    await settle();
    const el = byTestId("el");
    expect(el.style.translate).toBe("50px 50px");
    props.on = false;
    await settle();
    expect(el.style.translate).toBe("");
    unmount(app);
  });
});

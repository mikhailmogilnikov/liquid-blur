import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { LiftSelectEvent } from "../../src/lift/index.js";
import Child from "./svelte/Child.svelte";
import Photo from "./svelte/Photo.svelte";
import Probe from "./svelte/Probe.svelte";
import { reactive } from "./svelte/state.svelte";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => {
  vi.advanceTimersByTime(2000);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Svelte's effects run, then time goes by */
const settle = (ms = 0) => {
  flushSync();
  vi.advanceTimersByTime(ms);
  flushSync();
};
const layer = () => document.querySelector<HTMLDialogElement>("dialog[data-fk-lift]");
const rightClick = (el: Element) =>
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button, [role=menuitem]")].find((el) => el.textContent === text)!;

/** Photo mounted, its callbacks recorded */
function photo(props: Record<string, unknown> = {}) {
  const opens: boolean[] = [];
  const selects: Array<[string, HTMLElement]> = [];
  const app = mount(Photo, {
    target: document.body,
    props: {
      onOpenChange: (o: boolean) => opens.push(o),
      onSelect: (v: string, i: HTMLElement) => selects.push([v, i]),
      ...props,
    },
  });
  return { app, opens, selects };
}

describe("Lift (Svelte)", () => {
  it("renders its target and a hidden menu of items, and lifts on a right click", () => {
    const { app, opens } = photo();
    settle();
    const menu = byTestId("menu");
    expect(menu.hidden).toBe(true);
    expect(menu.getAttribute("role")).toBe("menu");
    expect([...menu.querySelectorAll<HTMLElement>("[role=menuitem]")].map((i) => i.dataset.value)).toEqual([
      "copy",
      "share",
      "delete",
    ]);
    rightClick(byTestId("photo"));
    settle();
    expect(layer()?.open).toBe(true);
    expect(layer()?.contains(menu)).toBe(true);
    expect(byTestId("photo").dataset.state).toBe("open");
    expect(opens.at(-1)).toBe(true);
    unmount(app);
  });

  it("tells the root the value chosen, and closes back where Svelte put the menu", () => {
    const { app, opens, selects } = photo();
    settle();
    rightClick(byTestId("photo"));
    settle();
    byText("Copy").click();
    expect(selects[0]).toEqual(["copy", byText("Copy")]);
    settle(2000);
    expect(layer()).toBeNull();
    expect(opens.at(-1)).toBe(false);
    expect(byTestId("menu").hidden).toBe(true);
    expect(byTestId("menu").parentElement?.style.display).toBe("contents");
    unmount(app);
  });

  it("keeps the menu open when an item's onSelect prevents the default", () => {
    const { app, selects } = photo({ itemSelect: (e: LiftSelectEvent) => e.preventDefault() });
    settle();
    rightClick(byTestId("photo"));
    settle();
    byText("Share").click();
    settle(2000);
    expect(selects[0]?.[0]).toBe("share");
    expect(layer()?.open).toBe(true);
    unmount(app);
  });

  it("never chooses a disabled item", () => {
    const { app, selects } = photo();
    settle();
    rightClick(byTestId("photo"));
    settle();
    expect(byText("Delete").getAttribute("aria-disabled")).toBe("true");
    byText("Delete").click();
    expect(selects).toEqual([]);
    unmount(app);
  });

  it("follows `open` when the parent drives it", () => {
    const props = reactive({ open: false });
    const app = mount(Photo, { target: document.body, props });
    settle();
    props.open = true;
    settle();
    expect(layer()?.open).toBe(true);
    props.open = false;
    settle(2000);
    expect(layer()).toBeNull();
    unmount(app);
  });

  it("takes new options without being made again: the latest callback, a new delay", () => {
    const engines = new Set<unknown>();
    const props = reactive({ delay: 500, label: "first", engines });
    const app = mount(Probe, { target: document.body, props }) as { calls: string[] };
    settle();
    props.delay = 100;
    props.label = "second";
    settle();
    expect(engines.size).toBe(1);
    // A press held 100ms lifts it now
    byTestId("el").dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 5,
        clientY: 5,
      }),
    );
    vi.advanceTimersByTime(120);
    expect(layer()?.open).toBe(true);
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, isPrimary: true }));
    vi.advanceTimersByTime(1000);
    byText("A").click();
    expect(app.calls).toEqual(["second"]);
    unmount(app);
  });

  it("can be unmounted while open, its menu put back first", () => {
    const { app } = photo();
    settle();
    rightClick(byTestId("photo"));
    settle();
    expect(layer()?.contains(byTestId("menu"))).toBe(true);
    expect(() => unmount(app)).not.toThrow();
    settle(100);
    expect(layer()).toBeNull();
    expect(document.querySelector("[data-testid=menu]")).toBeNull();
  });

  it("renders a part as an element of yours with a child snippet, our props merged in", () => {
    const onclick = vi.fn();
    const app = mount(Child, { target: document.body, props: { onclick } });
    settle();
    const img = document.querySelector<HTMLImageElement>("img[alt=photo]")!;
    expect(img.className).toBe("mine ours");
    img.click();
    expect(onclick).toHaveBeenCalled();
    rightClick(img);
    settle();
    expect(layer()?.contains(byTestId("menu"))).toBe(true);
    unmount(app);
  });
});

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import Link from "./svelte/Link.svelte";
import Nested from "./svelte/Nested.svelte";
import Probe from "./svelte/Probe.svelte";
import Refusing from "./svelte/Refusing.svelte";
import { reactive } from "./svelte/state.svelte";
import Tabs from "./svelte/Tabs.svelte";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  // Laid out as tabs would be: the container 300 × 40, its items 100px wide side by side (`data-x`)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const x = this.dataset.x;
    return x === undefined ? new DOMRect(0, 0, 300, 40) : new DOMRect(Number(x), 0, 100, 40);
  });
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const settle = (ms = 0) => {
  flushSync();
  vi.advanceTimersByTime(ms);
  flushSync();
};
/** Where the thumb is drawn: its left edge, or null while it's away */
const thumbAt = () => {
  const thumb = document.querySelector<HTMLElement>("[data-testid=thumb]")!;
  return thumb.style.visibility === "hidden" ? null : Number(/translate\(([-\d.]+)px/.exec(thumb.style.transform)?.[1]);
};
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!;

describe("Indicator (Svelte)", () => {
  it("rests on the item chosen at first", () => {
    const app = mount(Tabs, { target: document.body, props: { defaultValue: "releases" } });
    settle(1000);
    expect(thumbAt()).toBe(100);
    expect(byText("Releases").hasAttribute("data-selected")).toBe(true);
    unmount(app);
  });

  it("chooses an item clicked, rests there, and tells `onValueChange`", () => {
    const changes: string[] = [];
    const app = mount(Tabs, {
      target: document.body,
      props: { defaultValue: "overview", onValueChange: (v: string) => changes.push(v) },
    });
    settle(1000);
    byText("Audience").click();
    settle(1000);
    expect(changes).toEqual(["audience"]);
    expect(thumbAt()).toBe(200);
    expect(byText("Audience").hasAttribute("data-selected")).toBe(true);
    expect(byText("Overview").hasAttribute("data-selected")).toBe(false);
    unmount(app);
  });

  it("follows a bound value that says no to a change, and the parent's changes", () => {
    const props = reactive({ tab: "overview" });
    const app = mount(Refusing, { target: document.body, props });
    settle(1000);
    // A click asks; the parent says no: it stays
    byText("Releases").click();
    settle(1000);
    expect(thumbAt()).toBe(0);
    // The parent changes it
    props.tab = "audience";
    settle(1000);
    expect(thumbAt()).toBe(200);
    unmount(app);
  });

  it("follows `active`, pointed at from elsewhere, and goes back to rest on `null`", () => {
    const props = reactive<{ defaultValue: string; active: string | null }>({ defaultValue: "overview", active: null });
    const app = mount(Tabs, { target: document.body, props });
    settle(1000);
    props.active = "audience";
    settle(1000);
    expect(thumbAt()).toBe(200);
    props.active = null;
    settle(1000);
    expect(thumbAt()).toBe(0);
    unmount(app);
  });

  it("tells which item it's on as that changes", () => {
    const seen: (string | null)[] = [];
    const app = mount(Tabs, {
      target: document.body,
      props: { defaultValue: "overview", onActiveChange: (v: string | null) => seen.push(v) },
    });
    settle(1000);
    byText("Releases").click();
    settle(1000);
    expect(seen.at(-1)).toBe("releases");
    unmount(app);
  });

  it("takes a new trigger without being made again", () => {
    const engines = new Set<unknown>();
    const props = reactive<{ trigger: "manual" | "hover"; engines: Set<unknown> }>({ trigger: "manual", engines });
    const app = mount(Probe, { target: document.body, props });
    settle();
    props.trigger = "hover";
    settle();
    expect(engines.size).toBe(1);
    unmount(app);
  });

  it("keeps a nested root's items its own", () => {
    const app = mount(Nested, { target: document.body });
    settle(1000);
    expect(thumbAt()).toBe(0);
    const [outer, inner] = document.querySelectorAll<HTMLElement>("[data-fk-indicator-item]");
    expect(outer.dataset.fkIndicatorItem).not.toBe(inner.dataset.fkIndicatorItem);
    unmount(app);
  });

  it("renders an item as an element of yours with a child snippet", () => {
    const app = mount(Link, { target: document.body });
    settle();
    const link = document.querySelector<HTMLAnchorElement>("a[href='#inbox']")!;
    expect(link.hasAttribute("data-selected")).toBe(true);
    expect(link.hasAttribute("data-fk-indicator-item")).toBe(true);
    unmount(app);
  });
});

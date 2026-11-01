import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import Own from "./svelte/Own.svelte";
import { list } from "./svelte/state.svelte";
import Todos from "./svelte/Todos.svelte";
import { bare, column, offset } from "./column";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  column();
  list.todos = ["a", "b", "c"];
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Updated, and what the page changed seen */
const seen = async () => {
  flushSync();
  await tick();
  await Promise.resolve();
};
const settle = async () => {
  await seen();
  vi.advanceTimersByTime(2000);
  flushSync();
};
const root = () => document.querySelector<HTMLElement>("[data-testid=root]")!;

describe("Layout.Root", () => {
  it("renders as an element of yours, its children the items", async () => {
    const app = mount(Todos, { target: document.body });
    await seen();
    expect(root().tagName).toBe("UL");
    expect(root().children).toHaveLength(3);
    unmount(app);
  });

  it("moves the rows Svelte put in, and marks itself while it does", async () => {
    const app = mount(Todos, { target: document.body });
    await seen();
    list.todos = ["n", ...list.todos];
    await seen();
    expect(offset(document.getElementById("a")!).y).toBeCloseTo(-40);
    expect(root().hasAttribute("data-moving")).toBe(true);
    await settle();
    expect(root().hasAttribute("data-moving")).toBe(false);
    expect(bare(...root().children)).toBe(true);
    unmount(app);
  });

  it("lets one Svelte took out go out where it was, then it's gone", async () => {
    const app = mount(Todos, { target: document.body });
    await seen();
    const a = document.getElementById("a")!;
    list.todos = list.todos.slice(1);
    await seen();
    expect(a.isConnected).toBe(true);
    expect(a.hasAttribute("data-fk-part")).toBe(true);
    await settle();
    expect(a.isConnected).toBe(false);
    unmount(app);
  });

  it("comes in at once with `enter` off", async () => {
    const app = mount(Todos, { target: document.body, props: { enter: false } });
    await seen();
    list.todos = [...list.todos, "n"];
    await seen();
    expect(document.getElementById("n")!.style.opacity).toBe("");
    unmount(app);
  });

  it("leaves nothing of its own when unmounted on the way", async () => {
    const app = mount(Todos, { target: document.body });
    await seen();
    const b = document.getElementById("b")!;
    list.todos = ["n", ...list.todos];
    await seen();
    expect(b.style.translate).not.toBe("");
    unmount(app);
    expect(bare(b)).toBe(true);
  });
});

describe("useLayout", () => {
  it("moves the items of a root of yours", async () => {
    list.todos = ["a", "b"];
    const app = mount(Own, { target: document.body });
    await seen();
    list.todos = ["n", ...list.todos];
    await seen();
    expect(offset(document.getElementById("a")!).y).toBeCloseTo(-40);
    expect(root().hasAttribute("data-on")).toBe(true);
    await settle();
    expect(root().hasAttribute("data-on")).toBe(false);
    unmount(app);
  });
});

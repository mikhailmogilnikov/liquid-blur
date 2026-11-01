import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Layout, useLayout } from "../src/layout";
import { bare, column, offset } from "./column";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  column();
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const quick = { duration: 0.1, bounce: 0 };
/** Rendered, made (a microtask after its root is in), and what the page changed seen */
const seen = async () => {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
};
const settle = async () => {
  await seen();
  vi.advanceTimersByTime(2000);
  await nextTick();
};

const todos = ref<string[]>([]);
const enter = ref<false | undefined>(undefined);
const Todos = defineComponent({
  setup: () => () =>
    h(
      Layout.Root,
      { asChild: true, spring: quick, enter: enter.value },
      {
        default: () =>
          h(
            "ul",
            { "data-root": "" },
            todos.value.map((t) => h("li", { key: t, id: t }, t)),
          ),
      },
    ),
});

describe("Layout.Root", () => {
  beforeEach(() => {
    todos.value = ["a", "b", "c"];
    enter.value = undefined;
  });

  it("renders as the element in its slot, its children the items", async () => {
    const wrapper = mount(Todos, { attachTo: document.body });
    await seen();
    expect(wrapper.element.tagName).toBe("UL");
    expect(wrapper.element.children).toHaveLength(3);
    wrapper.unmount();
  });

  it("moves the rows Vue put in, and marks itself while it does", async () => {
    const wrapper = mount(Todos, { attachTo: document.body });
    await seen();
    todos.value = ["n", ...todos.value];
    await seen();
    expect(offset(document.getElementById("a")!).y).toBeCloseTo(-40);
    expect(wrapper.element.hasAttribute("data-moving")).toBe(true);
    await settle();
    expect(wrapper.element.hasAttribute("data-moving")).toBe(false);
    expect(bare(...wrapper.element.children)).toBe(true);
    wrapper.unmount();
  });

  it("lets one Vue took out go out where it was, then it's gone", async () => {
    const wrapper = mount(Todos, { attachTo: document.body });
    await seen();
    const a = document.getElementById("a")!;
    todos.value = todos.value.slice(1);
    await seen();
    expect(a.isConnected).toBe(true);
    expect(a.hasAttribute("data-fk-part")).toBe(true);
    await settle();
    expect(a.isConnected).toBe(false);
    wrapper.unmount();
  });

  it("takes new props without being made again", async () => {
    const wrapper = mount(Todos, { attachTo: document.body });
    await seen();
    enter.value = false;
    await seen();
    todos.value = [...todos.value, "n"];
    await seen();
    expect(document.getElementById("n")!.style.opacity).toBe("");
    wrapper.unmount();
  });

  it("leaves nothing of its own when unmounted on the way", async () => {
    const wrapper = mount(Todos, { attachTo: document.body });
    await seen();
    const b = document.getElementById("b")!;
    todos.value = ["n", ...todos.value];
    await seen();
    expect(b.style.translate).not.toBe("");
    wrapper.unmount();
    expect(bare(b)).toBe(true);
  });

  it("renders on the server without anything of its own", async () => {
    const html = await renderToString(h(Todos));
    expect(html).toContain("<ul");
    expect(html).not.toContain("transform");
  });
});

describe("useLayout", () => {
  it("moves the items of a root of yours", async () => {
    const rows = ref(["a", "b"]);
    const Own = defineComponent({
      setup() {
        const layout = useLayout({ spring: quick });
        return () =>
          h(
            "div",
            { ref: layout.root, "data-root": "", "data-on": layout.moving.value ? "" : undefined },
            rows.value.map((r) => h("p", { key: r, id: r })),
          );
      },
    });
    const wrapper = mount(Own, { attachTo: document.body });
    await seen();
    rows.value = ["n", ...rows.value];
    await seen();
    expect(offset(document.getElementById("a")!).y).toBeCloseTo(-40);
    expect(wrapper.element.hasAttribute("data-on")).toBe(true);
    await settle();
    expect(wrapper.element.hasAttribute("data-on")).toBe(false);
    wrapper.unmount();
  });
});

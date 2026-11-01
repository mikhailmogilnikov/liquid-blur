import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Indicator, useIndicator } from "../src/indicator";

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

const settle = async (ms = 0) => {
  await nextTick();
  await Promise.resolve();
  vi.advanceTimersByTime(ms);
  await nextTick();
};
/** Where the thumb is drawn: its left edge, or null while it's away */
const thumbAt = () => {
  const thumb = document.querySelector<HTMLElement>("[data-testid=thumb]")!;
  return thumb.style.visibility === "hidden" ? null : Number(/translate\(([-\d.]+)px/.exec(thumb.style.transform)?.[1]);
};
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!;

const tabs = (props: Record<string, unknown>) =>
  h(Indicator.Root, { trigger: "press", ...props }, () => [
    h(Indicator.Thumb, { "data-testid": "thumb" }),
    h(Indicator.Item, { value: "overview", "data-x": "0" }, () => "Overview"),
    h(Indicator.Item, { value: "releases", "data-x": "100" }, () => "Releases"),
    h(Indicator.Item, { value: "audience", "data-x": "200" }, () => "Audience"),
  ]);

describe("Indicator (Vue)", () => {
  it("rests on the item chosen at first", async () => {
    const wrapper = mount(
      defineComponent(() => () => tabs({ defaultValue: "releases" })),
      { attachTo: document.body },
    );
    await settle(1000);
    expect(thumbAt()).toBe(100);
    expect(byText("Releases").hasAttribute("data-selected")).toBe(true);
    wrapper.unmount();
  });

  it("chooses an item clicked, rests there, and tells `update:modelValue`", async () => {
    const changes: string[] = [];
    const wrapper = mount(
      defineComponent(
        () => () => tabs({ defaultValue: "overview", "onUpdate:modelValue": (v: string) => changes.push(v) }),
      ),
      { attachTo: document.body },
    );
    await settle(1000);
    byText("Audience").click();
    await settle(1000);
    expect(changes).toEqual(["audience"]);
    expect(thumbAt()).toBe(200);
    expect(byText("Audience").hasAttribute("data-selected")).toBe(true);
    expect(byText("Overview").hasAttribute("data-selected")).toBe(false);
    wrapper.unmount();
  });

  it("follows `v-model` when controlled, and only asks to change it", async () => {
    const tab = ref("overview");
    const wrapper = mount(
      defineComponent(() => () => tabs({ modelValue: tab.value, "onUpdate:modelValue": () => {} })),
      { attachTo: document.body },
    );
    await settle(1000);
    // A click asks; the parent says no: it stays
    byText("Releases").click();
    await settle(1000);
    expect(thumbAt()).toBe(0);
    // The parent changes it
    tab.value = "audience";
    await settle(1000);
    expect(thumbAt()).toBe(200);
    wrapper.unmount();
  });

  it("follows `active`, pointed at from elsewhere, and goes back to rest on `null`", async () => {
    const active = ref<string | null>(null);
    const wrapper = mount(
      defineComponent(() => () => tabs({ defaultValue: "overview", active: active.value })),
      {
        attachTo: document.body,
      },
    );
    await settle(1000);
    active.value = "audience";
    await settle(1000);
    expect(thumbAt()).toBe(200);
    active.value = null;
    await settle(1000);
    expect(thumbAt()).toBe(0);
    wrapper.unmount();
  });

  it("tells which item it's on as that changes", async () => {
    const seen: (string | null)[] = [];
    const wrapper = mount(
      defineComponent(
        () => () => tabs({ defaultValue: "overview", onActiveChange: (v: string | null) => seen.push(v) }),
      ),
      { attachTo: document.body },
    );
    await settle(1000);
    byText("Releases").click();
    await settle(1000);
    expect(seen.at(-1)).toBe("releases");
    wrapper.unmount();
  });

  it("takes a new trigger without being made again", async () => {
    const trigger = ref<"manual" | "hover">("manual");
    const engines = new Set<unknown>();
    const Probe = defineComponent(() => {
      const ind = useIndicator(() => ({ trigger: trigger.value }));
      return () => {
        if (ind.engine.value) engines.add(ind.engine.value);
        return h("div", { ref: ind.container }, [
          h("span", { ref: ind.indicator }),
          h("button", { ref: ind.item("a"), "data-x": "0" }, "A"),
          h("button", { ref: ind.item("b"), "data-x": "100" }, "B"),
        ]);
      };
    });
    const wrapper = mount(Probe, { attachTo: document.body });
    await settle();
    trigger.value = "hover";
    await settle();
    expect(engines.size).toBe(1);
    wrapper.unmount();
  });

  it("keeps a nested root's items its own", async () => {
    const wrapper = mount(
      defineComponent(
        () => () =>
          h(Indicator.Root, { defaultValue: "a", trigger: "manual" }, () => [
            h(Indicator.Thumb, { "data-testid": "thumb" }),
            h(Indicator.Item, { value: "a", "data-x": "0" }, () => "A"),
            h(Indicator.Root, { defaultValue: "c", trigger: "manual" }, () => [
              h(Indicator.Thumb),
              h(Indicator.Item, { value: "c", "data-x": "200" }, () => "C"),
            ]),
          ]),
      ),
      { attachTo: document.body },
    );
    await settle(1000);
    expect(thumbAt()).toBe(0);
    const [outer, inner] = document.querySelectorAll<HTMLElement>("[data-fk-indicator-item]");
    expect(outer.dataset.fkIndicatorItem).not.toBe(inner.dataset.fkIndicatorItem);
    wrapper.unmount();
  });

  it("renders as the element in its slot with as-child", async () => {
    const wrapper = mount(
      defineComponent(
        () => () =>
          h(Indicator.Root, { defaultValue: "inbox" }, () => [
            h(Indicator.Thumb),
            h(Indicator.Item, { value: "inbox", asChild: true }, () => [h("a", { href: "#inbox" }, "Inbox")]),
          ]),
      ),
      { attachTo: document.body },
    );
    await settle();
    const link = document.querySelector<HTMLAnchorElement>("a[href='#inbox']")!;
    expect(link.hasAttribute("data-selected")).toBe(true);
    expect(link.hasAttribute("data-fk-indicator-item")).toBe(true);
    wrapper.unmount();
  });

  it("renders on the server", async () => {
    const html = await renderToString(tabs({ defaultValue: "overview" }));
    expect(html).toContain("Overview");
    expect(html).toContain("data-selected");
  });
});

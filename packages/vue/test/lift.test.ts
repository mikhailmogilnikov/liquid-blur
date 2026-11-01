import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Lift, useLift, type LiftSelectEvent } from "../src/lift";

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

/** The engine is made at the end of the task its refs came in: let that end, and Vue render after */
const settle = async (ms = 0) => {
  await nextTick();
  await Promise.resolve();
  vi.advanceTimersByTime(ms);
  await nextTick();
};
const layer = () => document.querySelector<HTMLDialogElement>("dialog[data-fk-lift]");
const rightClick = (el: Element) =>
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button, [role=menuitem]")].find((el) => el.textContent === text)!;

const Photo = defineComponent({
  props: {
    open: { type: Boolean, default: undefined },
    itemSelect: Function as PropType<(e: LiftSelectEvent) => void>,
  },
  emits: ["select", "update:open"],
  setup(props, { emit }) {
    return () =>
      h(
        Lift.Root,
        {
          open: props.open,
          "onUpdate:open": (open: boolean) => emit("update:open", open),
          onSelect: (value: string, item: HTMLElement) => emit("select", value, item),
        },
        () => [
          h(Lift.Target, { "data-testid": "photo", tabindex: 0 }),
          h(Lift.Menu, { "aria-label": "Photo", "data-testid": "menu" }, () => [
            h(Lift.Item, { value: "copy" }, () => "Copy"),
            h(Lift.Item, { value: "share", onSelect: props.itemSelect }, () => "Share"),
            h(Lift.Separator),
            h(Lift.Item, { value: "delete", disabled: true }, () => "Delete"),
          ]),
        ],
      );
  },
});

describe("Lift (Vue)", () => {
  it("renders its target and a hidden menu of items, and lifts on a right click", async () => {
    const wrapper = mount(Photo, { attachTo: document.body });
    await settle();
    const menu = byTestId("menu");
    expect(menu.hidden).toBe(true);
    expect(menu.getAttribute("role")).toBe("menu");
    expect([...menu.querySelectorAll<HTMLElement>("[role=menuitem]")].map((i) => i.dataset.value)).toEqual([
      "copy",
      "share",
      "delete",
    ]);
    rightClick(byTestId("photo"));
    await settle();
    expect(layer()?.open).toBe(true);
    expect(layer()?.contains(menu)).toBe(true);
    expect(byTestId("photo").dataset.state).toBe("open");
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });

  it("tells the root the value chosen, and closes back where Vue put the menu", async () => {
    const wrapper = mount(Photo, { attachTo: document.body });
    await settle();
    rightClick(byTestId("photo"));
    await settle();
    byText("Copy").click();
    expect(wrapper.emitted("select")?.[0]).toEqual(["copy", byText("Copy")]);
    await settle(2000);
    expect(layer()).toBeNull();
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    expect(byTestId("menu").hidden).toBe(true);
    expect(byTestId("menu").parentElement?.style.display).toBe("contents");
    wrapper.unmount();
  });

  it("keeps the menu open when an item's select prevents the default", async () => {
    const wrapper = mount(Photo, {
      attachTo: document.body,
      props: { itemSelect: (e: LiftSelectEvent) => e.preventDefault() },
    });
    await settle();
    rightClick(byTestId("photo"));
    await settle();
    byText("Share").click();
    await settle(2000);
    expect(wrapper.emitted("select")?.[0]?.[0]).toBe("share");
    expect(layer()?.open).toBe(true);
    wrapper.unmount();
  });

  it("never chooses a disabled item", async () => {
    const wrapper = mount(Photo, { attachTo: document.body });
    await settle();
    rightClick(byTestId("photo"));
    await settle();
    expect(byText("Delete").getAttribute("aria-disabled")).toBe("true");
    byText("Delete").click();
    expect(wrapper.emitted("select")).toBeUndefined();
    wrapper.unmount();
  });

  it("follows `v-model:open` when controlled", async () => {
    const open = ref(false);
    const wrapper = mount(
      defineComponent(() => () => h(Photo, { open: open.value, "onUpdate:open": (v: boolean) => (open.value = v) })),
      { attachTo: document.body },
    );
    await settle();
    open.value = true;
    await settle();
    expect(layer()?.open).toBe(true);
    open.value = false;
    await settle(2000);
    expect(layer()).toBeNull();
    wrapper.unmount();
  });

  it("takes new options without being made again: the latest callback, a new delay", async () => {
    const delay = ref(500);
    const label = ref("first");
    const calls: string[] = [];
    const engines = new Set<unknown>();
    const Probe = defineComponent(() => {
      const lift = useLift(() => ({ delay: delay.value, onSelect: () => void calls.push(label.value) }));
      return () => {
        if (lift.lift.value) engines.add(lift.lift.value);
        return h("div", [
          h("div", { ref: lift.element, "data-testid": "el" }),
          h("div", [
            h("div", { ref: lift.menu, role: "menu", hidden: true }, [h("button", { role: "menuitem" }, "A")]),
          ]),
        ]);
      };
    });
    const wrapper = mount(Probe, { attachTo: document.body });
    await settle();
    delay.value = 100;
    label.value = "second";
    await settle();
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
    expect(calls).toEqual(["second"]);
    wrapper.unmount();
  });

  it("can be unmounted while open, its menu put back first", async () => {
    const wrapper = mount(Photo, { attachTo: document.body });
    await settle();
    rightClick(byTestId("photo"));
    await settle();
    expect(layer()?.contains(byTestId("menu"))).toBe(true);
    expect(() => wrapper.unmount()).not.toThrow();
    await settle(100);
    expect(layer()).toBeNull();
    expect(document.querySelector("[data-testid=menu]")).toBeNull();
  });

  it("renders on the server, its menu hidden, nothing lifted", async () => {
    const html = await renderToString(h(Photo));
    expect(html).toContain('role="menu"');
    expect(html).toContain("hidden");
    expect(html).toContain('role="menuitem"');
  });

  it("renders a part as the element in its slot with as-child, our attributes merged in", async () => {
    const onClick = vi.fn();
    const wrapper = mount(
      defineComponent(
        () => () =>
          h(Lift.Root, null, () => [
            h(Lift.Target, { asChild: true, class: "ours" }, () => [
              h("img", { alt: "photo", class: "mine", onClick }),
            ]),
            h(Lift.Menu, { "data-testid": "menu" }, () => [h(Lift.Item, { value: "a" }, () => "A")]),
          ]),
      ),
      { attachTo: document.body },
    );
    await settle();
    const img = document.querySelector<HTMLImageElement>("img[alt=photo]")!;
    expect(img.className).toBe("mine ours");
    img.click();
    expect(onClick).toHaveBeenCalled();
    rightClick(img);
    await settle();
    expect(layer()?.contains(byTestId("menu"))).toBe(true);
    wrapper.unmount();
  });
});

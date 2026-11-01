import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Drag, useDrag } from "../src/drag";

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
  await nextTick();
  await Promise.resolve();
  vi.advanceTimersByTime(ms);
  await nextTick();
  await nextTick();
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

const sheet = (props: Record<string, unknown> = {}) =>
  h("div", [
    h(
      Drag.Root,
      {
        axis: "y",
        snaps: ({ height }: { height: number }) => [0, height / 2, height - 76],
        "data-testid": "sheet",
        ...props,
      },
      () => [h(Drag.Handle, { "data-testid": "grabber" }), h(Drag.Scroll, { "data-testid": "list" })],
    ),
  ]);
const app = (render: () => ReturnType<typeof h>) =>
  mount(
    defineComponent(() => render),
    { attachTo: document.body },
  );

describe("Drag (Vue)", () => {
  it("starts at `defaultSnap`, snap points read from the room it's in", async () => {
    const wrapper = app(() => sheet({ defaultSnap: 1 }));
    await settle();
    expect(offset(byTestId("sheet"))).toBe(300);
    expect(byTestId("sheet").dataset.snap).toBe("1");
    wrapper.unmount();
  });

  it("is dragged by its handle, and tells the snap point it's let go at", async () => {
    const changes: number[] = [];
    const wrapper = app(() => sheet({ defaultSnap: 1, "onUpdate:snap": (s: number) => changes.push(s) }));
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
    wrapper.unmount();
  });

  it("follows `v-model:snap` when controlled", async () => {
    const snap = ref(0);
    const wrapper = app(() => sheet({ snap: snap.value, "onUpdate:snap": (s: number) => (snap.value = s) }));
    await settle();
    expect(offset(byTestId("sheet"))).toBe(0);
    snap.value = 2;
    await settle();
    expect(offset(byTestId("sheet"))).toBe(524);
    wrapper.unmount();
  });

  it("goes back when controlled and the parent keeps `snap` as it was", async () => {
    const changes: number[] = [];
    const wrapper = app(() => sheet({ snap: 1, "onUpdate:snap": (s: number) => changes.push(s) }));
    await settle();
    fling(byTestId("grabber"), 300, 260);
    await settle();
    expect(changes).toEqual([2]);
    expect(offset(byTestId("sheet"))).toBe(300);
    wrapper.unmount();
  });

  it("follows snap points of the room that change with a render", async () => {
    const peek = ref(76);
    const wrapper = app(() =>
      sheet({ defaultSnap: 1, snaps: ({ height }: { height: number }) => [0, height - peek.value] }),
    );
    await settle();
    expect(offset(byTestId("sheet"))).toBe(524);
    peek.value = 100;
    await settle();
    expect(offset(byTestId("sheet"))).toBe(500);
    wrapper.unmount();
  });

  it("takes new options without being made again, and is made again for another axis where it was", async () => {
    const axis = ref<"x" | "y">("y");
    const duration = ref(0.4);
    const engines = new Set<unknown>();
    const Probe = defineComponent(() => {
      const drag = useDrag(() => ({
        axis: axis.value,
        snaps: [0, 100],
        defaultSnap: 1,
        spring: { duration: duration.value, bounce: 0 },
      }));
      return () => {
        if (drag.drag.value) engines.add(drag.drag.value);
        return h("div", [h("div", { ref: drag.element, "data-testid": "el" })]);
      };
    });
    const wrapper = mount(Probe, { attachTo: document.body });
    await settle();
    duration.value = 0.5;
    await settle();
    expect(engines.size).toBe(1);
    axis.value = "x";
    await settle();
    expect(engines.size).toBe(2);
    expect(byTestId("el").style.translate).toBe("100px 0px");
    wrapper.unmount();
  });

  it("isn't dragged while disabled", async () => {
    const disabled = ref(true);
    const wrapper = app(() => sheet({ defaultSnap: 0, disabled: disabled.value }));
    await settle();
    fling(byTestId("grabber"), 0, 400);
    await settle();
    expect(offset(byTestId("sheet"))).toBe(0);
    disabled.value = false;
    await settle();
    fling(byTestId("grabber"), 0, 400);
    await settle();
    expect(offset(byTestId("sheet"))).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("gives its element its own translate back on unmount", async () => {
    const on = ref(true);
    const Probe = defineComponent(() => {
      const drag = useDrag({
        snaps: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
        ],
        defaultSnap: 1,
      });
      return () => h("div", [on.value ? h("div", { ref: drag.element, "data-testid": "el" }) : null]);
    });
    const wrapper = mount(Probe, { attachTo: document.body });
    await settle();
    const el = byTestId("el");
    expect(el.style.translate).toBe("50px 50px");
    on.value = false;
    await settle();
    expect(el.style.translate).toBe("");
    wrapper.unmount();
  });

  it("renders on the server, at offset 0", async () => {
    const html = await renderToString(sheet({ defaultSnap: 1 }));
    expect(html).toContain('data-snap="1"');
    expect(html).not.toContain("translate");
  });
});

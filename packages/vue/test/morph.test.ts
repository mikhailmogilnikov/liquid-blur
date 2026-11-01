import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Morph, useMorph } from "../src/morph";

beforeEach(() => {
  // Reduced motion: the states swap at once, so a test sees where it's gone without frames
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const settle = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!;
const away = (el: HTMLElement) => el.hasAttribute("data-fk-away");

const more = (props: Record<string, unknown> = {}) =>
  h("div", [
    h(Morph.Root, props, () => [
      h(Morph.State, { value: "button", "data-testid": "button", asChild: true }, () => [
        h(Morph.Trigger, { value: "panel" }, () => "More"),
      ]),
      h(Morph.State, { value: "panel", "data-testid": "panel" }, () => [
        h(Morph.Trigger, { value: "button" }, () => "Close"),
      ]),
    ]),
  ]);
const app = (render: () => ReturnType<typeof h>) =>
  mount(
    defineComponent(() => render),
    { attachTo: document.body },
  );

describe("Morph (Vue)", () => {
  it("starts at the first state, the others away", async () => {
    const wrapper = app(() => more());
    await settle();
    expect(away(byTestId("button"))).toBe(false);
    expect(away(byTestId("panel"))).toBe(true);
    expect(byTestId("button").hasAttribute("data-current")).toBe(true);
    wrapper.unmount();
  });

  it("starts at `defaultValue`", async () => {
    const wrapper = app(() => more({ defaultValue: "panel" }));
    await settle();
    expect(away(byTestId("button"))).toBe(true);
    expect(away(byTestId("panel"))).toBe(false);
    wrapper.unmount();
  });

  it("goes where a trigger sends it, a state rendered as one too, and tells it by value", async () => {
    const changes: string[] = [];
    const rests: string[] = [];
    const wrapper = app(() =>
      more({ "onUpdate:modelValue": (v: string) => changes.push(v), onRest: (at: string) => rests.push(at) }),
    );
    await settle();
    // The state is the trigger: a button, with its text
    expect(byTestId("button").tagName).toBe("BUTTON");
    byText("More").click();
    await settle();
    expect(changes).toEqual(["panel"]);
    expect(rests.at(-1)).toBe("panel");
    expect(away(byTestId("panel"))).toBe(false);
    expect(byTestId("panel").hasAttribute("data-current")).toBe(true);
    byText("Close").click();
    await settle();
    expect(rests.at(-1)).toBe("button");
    expect(away(byTestId("panel"))).toBe(true);
    wrapper.unmount();
  });

  it("follows `v-model` when controlled, and only asks to change it", async () => {
    const value = ref("button");
    const wrapper = app(() => more({ modelValue: value.value, "onUpdate:modelValue": () => {} }));
    await settle();
    byText("More").click();
    await settle();
    expect(away(byTestId("panel"))).toBe(true);
    value.value = "panel";
    await settle();
    expect(away(byTestId("panel"))).toBe(false);
    wrapper.unmount();
  });

  it("flies once what the same click changed is rendered: a pick relabels the pill first", async () => {
    let seen = "";
    const sort = ref("Newest");
    const wrapper = app(() =>
      h(
        Morph.Root,
        { defaultValue: "panel", onStart: () => (seen = document.getElementById("pill")!.textContent!) },
        () => [
          h(Morph.State, { value: "pill", id: "pill" }, () => sort.value),
          h(Morph.State, { value: "panel" }, () => [
            h(Morph.Trigger, { value: "pill", onClick: () => (sort.value = "Oldest") }, () => "Oldest"),
          ]),
        ],
      ),
    );
    await settle();
    byText("Oldest").click();
    await settle();
    expect(seen).toBe("Oldest");
    wrapper.unmount();
  });

  it("resolves `to()` once it rests there", async () => {
    let to: ((v: string) => Promise<boolean>) | null = null;
    const Probe = defineComponent(() => {
      const morph = useMorph();
      to = morph.to;
      return () => h("div", [h("div", { ref: morph.state("a") }, "A"), h("div", { ref: morph.state("b") }, "B")]);
    });
    const wrapper = mount(Probe, { attachTo: document.body });
    await settle();
    let rested: boolean | null = null;
    void to!("b").then((r) => (rested = r));
    await settle();
    await settle();
    expect(rested).toBe(true);
    wrapper.unmount();
  });

  it("takes a state that comes later, and lets go of one that goes", async () => {
    const items = ref(["a"]);
    const wrapper = app(() =>
      h(Morph.Root, null, () => [
        h(Morph.State, { value: "dot", "data-testid": "dot" }),
        ...items.value.map((item) => h(Morph.State, { key: item, value: item, "data-testid": item })),
      ]),
    );
    await settle();
    items.value = ["a", "b"];
    await settle();
    expect(away(byTestId("b"))).toBe(true);
    const a = byTestId("a");
    items.value = ["b"];
    await settle();
    expect(document.querySelector("[data-testid=a]")).toBeNull();
    expect(away(a)).toBe(false);
    expect(a.style.visibility).toBe("");
    wrapper.unmount();
  });

  it("is made again from the others when the state it's at goes", async () => {
    const dot = ref(true);
    const wrapper = app(() =>
      h(Morph.Root, null, () => [
        dot.value ? h(Morph.State, { value: "dot", "data-testid": "dot" }) : null,
        h(Morph.State, { value: "bar", "data-testid": "bar" }),
      ]),
    );
    await settle();
    expect(away(byTestId("bar"))).toBe(true);
    dot.value = false;
    await settle();
    expect(away(byTestId("bar"))).toBe(false);
    wrapper.unmount();
  });

  it("takes new springs without being made again", async () => {
    const duration = ref(0.4);
    const engines = new Set<unknown>();
    const Probe = defineComponent(() => {
      const morph = useMorph(() => ({ spring: { grow: { x: { duration: duration.value, bounce: 0 } } } }));
      return () => {
        if (morph.morph.value) engines.add(morph.morph.value);
        return h("div", [h("div", { ref: morph.state("a") }, "A"), h("div", { ref: morph.state("b") }, "B")]);
      };
    });
    const wrapper = mount(Probe, { attachTo: document.body });
    await settle();
    duration.value = 0.6;
    await settle();
    expect(engines.size).toBe(1);
    wrapper.unmount();
  });

  it("marks a match by its name", async () => {
    const wrapper = app(() =>
      h(Morph.Root, null, () => [
        h(Morph.State, { value: "a" }, () => [
          h(Morph.Match, { name: "icon" }, () => "I"),
          h(Morph.Match, null, () => "none"),
        ]),
      ]),
    );
    await settle();
    const spans = [...document.querySelectorAll("span")];
    expect(spans.find((s) => s.textContent === "I")!.dataset.fkMatch).toBe("icon");
    expect(spans.find((s) => s.textContent === "none")!.hasAttribute("data-fk-match")).toBe(false);
    wrapper.unmount();
  });

  it("renders on the server, the states as they're written", async () => {
    const html = await renderToString(more());
    expect(html).toContain('data-testid="button"');
    expect(html).toContain('data-testid="panel"');
    expect(html).not.toContain("data-fk-away");
  });
});

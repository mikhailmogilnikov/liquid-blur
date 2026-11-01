import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { installPress } from "@fluidkit/core";
import { Glass, glass, useGlassGroup } from "../src/blur";

afterEach(() => {
  document.body.innerHTML = "";
});

const settle = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
const app = (render: () => ReturnType<typeof h>) =>
  mount(
    defineComponent(() => render),
    { attachTo: document.body },
  );
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("*")].find((el) => el.textContent === text && !el.children.length)!;

describe("Glass (Vue)", () => {
  it("is glass with its variants as classes and custom properties, yours kept", async () => {
    const wrapper = app(() =>
      h(
        Glass,
        { clear: true, tint: "#0a84ff", depth: 0.8, stretch: "x", class: "pill", style: { padding: "4px" } },
        () => "Glass",
      ),
    );
    await settle();
    const el = byText("Glass");
    expect(el.tagName).toBe("DIV");
    expect([...el.classList]).toEqual(["lb", "lb-clear", "lb-tinted", "lb-stretch", "pill"]);
    expect(el.style.getPropertyValue("--lb-tint")).toBe("#0a84ff");
    expect(el.style.getPropertyValue("--lb-depth")).toBe("0.8");
    expect(el.style.getPropertyValue("--lb-stretch-axis")).toBe("x");
    expect(el.style.padding).toBe("4px");
    wrapper.unmount();
  });

  it("renders as the element in its slot with as-child, its classes joined", async () => {
    const wrapper = app(() =>
      h(Glass, { interactive: true, asChild: true }, () => [h("button", { type: "button", class: "mine" }, "Follow")]),
    );
    await settle();
    const el = byText("Follow");
    expect(el.tagName).toBe("BUTTON");
    expect(el.className).toBe("mine lb lb-interactive");
    wrapper.unmount();
  });

  it("installs press the first time glass needs it, and not before", async () => {
    // An earlier test's glass installed it: uninstalled, it's as on a page that hasn't yet
    installPress()();
    const highlight = ref(false);
    const wrapper = app(() => h(Glass, { highlight: highlight.value }, () => "Plain"));
    await settle();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(false);
    highlight.value = true;
    await settle();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(true);
    wrapper.unmount();
  });

  it("makes a group of its root once it's in the page, and lets go of it when it goes", async () => {
    const shown = ref(true);
    const wrapper = app(() =>
      h("div", { id: "host" }, [
        shown.value
          ? h(Glass.Group, { merge: 24 }, () => [h(Glass, null, () => "A"), h(Glass, null, () => "B")])
          : null,
      ]),
    );
    await settle();
    const root = document.querySelector<HTMLElement>("#host > div")!;
    expect(root.className).toBe("lb lb-group");
    expect(root.style.getPropertyValue("--lb-merge")).toBe("24px");
    expect(root.hasAttribute("data-fk-surface")).toBe(true);
    expect(root.querySelector("[data-fk-part]")).not.toBeNull();
    shown.value = false;
    await settle();
    expect(root.hasAttribute("data-fk-surface")).toBe(false);
    expect(root.querySelector("[data-fk-part]")).toBeNull();
    wrapper.unmount();
  });

  it("gives the group to the composable", async () => {
    let seen: unknown = null;
    const Toolbar = defineComponent(() => {
      const { root, group } = useGlassGroup();
      return () => {
        seen = group.value;
        return h("div", { ref: root, class: "lb lb-group" }, [h("div", { class: "lb" }, "A")]);
      };
    });
    const wrapper = mount(Toolbar, { attachTo: document.body });
    await settle();
    expect(seen).not.toBeNull();
    wrapper.unmount();
  });

  it("gives the class and properties for glass of your own, to bind", () => {
    expect(glass({ interactive: true, transparency: 1 })).toEqual({
      class: "lb lb-interactive",
      style: { "--lb-transparency": 1 },
    });
  });

  it("renders on the server", async () => {
    const html = await renderToString(h(Glass.Group, null, () => [h(Glass, { interactive: true }, () => "A")]));
    expect(html).toContain('class="lb lb-group"');
    expect(html).toContain('class="lb lb-interactive"');
  });
});

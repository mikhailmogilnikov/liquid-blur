import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { installPress } from "@fluidkit/core";
import { glass } from "../../src/blur/index.js";
import Child from "./svelte/Child.svelte";
import Group from "./svelte/Group.svelte";
import Press from "./svelte/Press.svelte";
import { reactive } from "./svelte/state.svelte";
import Styled from "./svelte/Styled.svelte";
import Toolbar from "./svelte/Toolbar.svelte";

afterEach(() => {
  document.body.innerHTML = "";
});

const settle = async () => {
  flushSync();
  await tick();
  flushSync();
};
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("*")].find((el) => el.textContent === text && !el.children.length)!;

describe("Glass (Svelte)", () => {
  it("is glass with its variants as classes and custom properties, yours kept", async () => {
    const app = mount(Styled, { target: document.body });
    await settle();
    const el = byText("Glass");
    expect(el.tagName).toBe("DIV");
    expect([...el.classList]).toEqual(["lb", "lb-clear", "lb-tinted", "lb-stretch", "pill"]);
    expect(el.style.getPropertyValue("--lb-tint")).toBe("#0a84ff");
    expect(el.style.getPropertyValue("--lb-depth")).toBe("0.8");
    expect(el.style.getPropertyValue("--lb-stretch-axis")).toBe("x");
    expect(el.style.padding).toBe("4px");
    unmount(app);
  });

  it("renders as an element of yours with a child snippet, its classes joined", async () => {
    const app = mount(Child, { target: document.body });
    await settle();
    const el = byText("Follow");
    expect(el.tagName).toBe("BUTTON");
    expect(el.className).toBe("lb lb-interactive mine");
    unmount(app);
  });

  it("installs press the first time glass needs it, and not before", async () => {
    // An earlier test's glass installed it: uninstalled, it's as on a page that hasn't yet
    installPress()();
    const props = reactive({ highlight: false });
    const app = mount(Press, { target: document.body, props });
    await settle();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(false);
    props.highlight = true;
    await settle();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(true);
    unmount(app);
  });

  it("makes a group of its root once it's in the page, and lets go of it when it goes", async () => {
    const props = reactive({ shown: true });
    const app = mount(Group, { target: document.body, props });
    await settle();
    const root = document.querySelector<HTMLElement>("#host > div")!;
    expect(root.className).toBe("lb lb-group");
    expect(root.style.getPropertyValue("--lb-merge")).toBe("24px");
    expect(root.hasAttribute("data-fk-surface")).toBe(true);
    expect(root.querySelector("[data-fk-part]")).not.toBeNull();
    props.shown = false;
    await settle();
    expect(root.hasAttribute("data-fk-surface")).toBe(false);
    expect(root.querySelector("[data-fk-part]")).toBeNull();
    unmount(app);
  });

  it("gives the group to the function", async () => {
    const seen = reactive<{ group: unknown }>({ group: null });
    const app = mount(Toolbar, { target: document.body, props: { seen } });
    await settle();
    expect(seen.group).not.toBeNull();
    unmount(app);
  });

  it("gives the class and properties for glass of your own, to spread", () => {
    expect(glass({ interactive: true, transparency: 1 })).toEqual({
      class: "lb lb-interactive",
      style: "--lb-transparency: 1",
    });
  });
});

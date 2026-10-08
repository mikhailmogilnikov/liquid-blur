import { afterEach, describe, expect, it } from "vitest";
import { createGlassGroup, installGlassGroups } from "../src/group";

/** A group root with two glass children at the given boxes */
function groupOf(classes: string, ...boxes: [number, number, number, number][]) {
  const root = document.createElement("div");
  root.className = classes;
  root.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  for (const [x, y, width, height] of boxes) {
    const el = document.createElement("div");
    el.className = "lb";
    el.style.borderRadius = `${height / 2}px`;
    el.getBoundingClientRect = () => new DOMRect(x, y, width, height);
    root.append(el);
  }
  document.body.append(root);
  return root;
}

/** Lets the batched mutation scan run */
const flush = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createGlassGroup", () => {
  it("returns the same group for the same root", () => {
    const root = groupOf("", [0, 0, 100, 40]);
    const group = createGlassGroup(root);
    expect(createGlassGroup(root)).toBe(group);
    group.destroy();
  });

  it("melts close children and leaves far ones as glass", () => {
    const apart = groupOf("", [0, 0, 100, 40], [200, 0, 100, 40]);
    const close = groupOf("", [0, 0, 100, 40], [110, 0, 100, 40]);
    const a = createGlassGroup(apart);
    const b = createGlassGroup(close);
    expect(apart.hasAttribute("data-lb-melted")).toBe(false);
    expect(close.hasAttribute("data-lb-melted")).toBe(true);
    a.destroy();
    b.destroy();
  });

  it("leaves hidden children out", () => {
    const root = groupOf("", [0, 0, 100, 40], [110, 0, 100, 40]);
    (root.children[1] as HTMLElement).style.visibility = "hidden";
    const group = createGlassGroup(root);
    expect(root.hasAttribute("data-lb-melted")).toBe(false);
    group.destroy();
  });

  it("leaves a morph's away control out", () => {
    const root = groupOf("", [0, 0, 100, 40], [110, 0, 100, 40]);
    root.children[1].setAttribute("data-lb-away", "");
    const group = createGlassGroup(root);
    expect(root.hasAttribute("data-lb-melted")).toBe(false);
    group.destroy();
  });

  it("follows an animation that started before the group did", async () => {
    const root = groupOf("", [0, 0, 100, 40], [200, 0, 100, 40]);
    const drop = root.children[1] as HTMLElement;
    // Running already, as a CSS animation started on first render: no start event will come
    let checks = 0;
    drop.getAnimations = () => {
      checks++;
      return [{ pending: false, playState: "running" } as Animation];
    };
    const group = createGlassGroup(root);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // The group's frame loop is on it, frame after frame
    expect(checks).toBeGreaterThanOrEqual(2);
    group.destroy();
  });

  it("measures in the root's own pixels under a scaled ancestor", () => {
    // Two capsules 30px apart in layout, seen through an ancestor at half scale
    const root = groupOf("", [0, 0, 50, 20], [65, 0, 50, 20]);
    Object.defineProperty(root, "offsetWidth", { value: 800 });
    Object.defineProperty(root, "offsetHeight", { value: 400 });
    for (const el of root.children) Object.defineProperty(el, "offsetWidth", { value: 100 });
    const group = createGlassGroup(root);
    // On screen they're 15px apart, under the merge distance; in layout 30px, over it
    expect(root.hasAttribute("data-lb-melted")).toBe(false);
    group.destroy();
  });

  it("removes only what it added on destroy", () => {
    const root = groupOf("lb-group", [0, 0, 100, 40]);
    createGlassGroup(root).destroy();
    expect(root.className).toBe("lb-group");
    expect(root.children).toHaveLength(1);
    expect(root.hasAttribute("data-lb-surface")).toBe(false);
  });

  it("marks its root a surface and its own elements parts while it runs", () => {
    const root = groupOf("", [0, 0, 100, 40]);
    const group = createGlassGroup(root);
    expect(root.hasAttribute("data-lb-surface")).toBe(true);
    const parts = [...root.children].filter((el) => el.hasAttribute("data-lb-part"));
    expect(parts.map((el) => el.className).sort()).toEqual(["lb-group__glass", "lb-group__paint"]);
    group.destroy();
  });
});

describe("installGlassGroups", () => {
  it("picks up .lb-group roots, now and later, and lets go of removed ones", async () => {
    const first = groupOf("lb-group", [0, 0, 100, 40]);
    const uninstall = installGlassGroups();
    expect(first.classList.contains("lb")).toBe(true);
    expect(first.querySelector(".lb-group__glass")).not.toBeNull();

    const later = groupOf("lb-group", [0, 0, 100, 40]);
    await flush();
    expect(later.querySelector(".lb-group__glass")).not.toBeNull();

    later.remove();
    await flush();
    expect(later.querySelector(".lb-group__glass")).toBeNull();
    expect(later.classList.contains("lb")).toBe(false);

    uninstall();
    expect(first.querySelector(".lb-group__glass")).toBeNull();
  });

  it("returns the first install when installed twice", () => {
    const uninstall = installGlassGroups();
    expect(installGlassGroups()).toBe(uninstall);
    uninstall();
  });
});

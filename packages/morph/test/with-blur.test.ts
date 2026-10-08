import { createGlassGroup } from "@liquid-web/blur/melt";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createMorph } from "../src/index";

/**
 * Morph and a glass group from @liquid-web/blur, for real: neither imports the other, they meet
 * only through the attributes in @liquid-web/core. This is what keeps that contract honest.
 */
function dock() {
  const root = document.createElement("div");
  root.className = "lb-group";
  root.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  const bar = document.createElement("div");
  bar.className = "lb";
  bar.style.borderRadius = "22px";
  bar.getBoundingClientRect = () => new DOMRect(70, 120, 160, 44);
  const source = document.createElement("button");
  source.className = "lb";
  source.style.borderRadius = "22px";
  source.getBoundingClientRect = () => new DOMRect(20, 120, 44, 44);
  root.append(bar, source);
  // The panel opens up over the bar
  const content = document.createElement("div");
  content.style.borderRadius = "28px";
  content.getBoundingClientRect = () => new DOMRect(20, 20, 240, 160);
  document.body.append(root, content);
  return { root, source, content };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("morph in a glass group", () => {
  it("lifts out over a running group, and stays in a group that no longer runs", () => {
    const { root, source, content } = dock();
    const group = createGlassGroup(root);
    const morph = createMorph({ source, content });
    morph.open({ instant: true });
    // Over the group, as its own glass; the control marked away, which the group leaves out
    expect(root.nextElementSibling?.getAttribute("data-lw-part")).toBe("");
    expect(source.hasAttribute("data-lw-away")).toBe(true);
    morph.close({ instant: true });

    group.destroy();
    morph.open({ instant: true });
    // No group runs: nothing to lift out of, the copy stays beside the control
    expect(source.nextElementSibling?.getAttribute("data-lw-part")).toBe("");
    expect(root.nextElementSibling).toBe(content);
    morph.destroy();
  });

  it("isn't counted as a neighbor by the group's own elements", () => {
    const { root, source, content } = dock();
    // The bar moved away: only the group's glass and paint are left to overlap the panel
    (root.children[0] as HTMLElement).getBoundingClientRect = () => new DOMRect(300, 0, 80, 44);
    const group = createGlassGroup(root);
    const morph = createMorph({ source, content });
    morph.open({ instant: true });
    expect(source.nextElementSibling?.getAttribute("data-lw-part")).toBe("");
    morph.destroy();
    group.destroy();
  });
});

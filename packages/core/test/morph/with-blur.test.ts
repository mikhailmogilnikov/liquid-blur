import { createGlassGroup } from "../../src/blur/index";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createMorph } from "../../src/morph/index";

/**
 * Morph and a glass group from blur, for real: neither imports the other, they meet
 * only through the attributes in the base. This is what keeps that contract honest.
 */
function dock() {
  const root = document.createElement("div");
  root.className = "lb lb-group";
  root.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  const bar = document.createElement("div");
  bar.className = "lb";
  bar.style.borderRadius = "22px";
  bar.getBoundingClientRect = () => new DOMRect(70, 120, 160, 44);
  const button = document.createElement("button");
  button.className = "lb";
  button.style.borderRadius = "22px";
  button.getBoundingClientRect = () => new DOMRect(20, 120, 44, 44);
  root.append(bar, button);
  // The panel opens up over the bar
  const panel = document.createElement("div");
  panel.style.borderRadius = "28px";
  panel.getBoundingClientRect = () => new DOMRect(20, 20, 240, 160);
  document.body.append(root, panel);
  return { root, bar, button, panel };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("morph in a glass group", () => {
  it("lifts out over a running group, and stays in a group that no longer runs", () => {
    const { root, button, panel } = dock();
    const group = createGlassGroup(root);
    const morph = createMorph({ states: [button, panel] });
    void morph.to(panel);
    // Over the group, as glass of its own; the control marked away, which the group leaves out
    expect(root.nextElementSibling?.hasAttribute("data-fk-part")).toBe(true);
    expect(button.hasAttribute("data-fk-away")).toBe(true);
    morph.destroy();

    group.destroy();
    const again = createMorph({ states: [button, panel] });
    void again.to(panel);
    // No group runs: nothing to lift out of, the shape stays beside the control
    expect(button.nextElementSibling?.hasAttribute("data-fk-part")).toBe(true);
    expect(root.nextElementSibling).toBe(panel);
    again.destroy();
  });

  it("isn't counted as a neighbor by the group's own elements", () => {
    const { root, bar, button, panel } = dock();
    // The bar moved away: only the group's glass and paint are left to overlap the panel
    bar.getBoundingClientRect = () => new DOMRect(300, 0, 80, 44);
    const group = createGlassGroup(root);
    const morph = createMorph({ states: [button, panel] });
    void morph.to(panel);
    expect(button.nextElementSibling?.hasAttribute("data-fk-part")).toBe(true);
    expect(root.nextElementSibling).toBe(panel);
    morph.destroy();
    group.destroy();
  });
});

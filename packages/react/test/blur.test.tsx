import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { installPress } from "@fluidkit/core";
import { Glass, glass, useGlassGroup } from "../src/blur";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const settle = () => act(async () => await Promise.resolve());

describe("Glass (React)", () => {
  it("is glass with its variants as classes and custom properties, yours kept", () => {
    const { getByText } = render(
      <Glass clear tint="#0a84ff" depth={0.8} stretch="x" className="pill" style={{ padding: 4 }}>
        Glass
      </Glass>,
    );
    const el = getByText("Glass");
    expect(el.tagName).toBe("DIV");
    expect([...el.classList]).toEqual(["lb", "lb-clear", "lb-tinted", "lb-stretch", "pill"]);
    expect(el.style.getPropertyValue("--lb-tint")).toBe("#0a84ff");
    expect(el.style.getPropertyValue("--lb-depth")).toBe("0.8");
    expect(el.style.getPropertyValue("--lb-stretch-axis")).toBe("x");
    expect(el.style.padding).toBe("4px");
  });

  it("renders as an element of yours, its classes joined", () => {
    const { getByText } = render(
      <Glass interactive render={<button type="button" className="mine" />}>
        Follow
      </Glass>,
    );
    const el = getByText("Follow");
    expect(el.tagName).toBe("BUTTON");
    expect(el.className).toBe("lb lb-interactive mine");
  });

  it("installs press the first time glass needs it, and not before", async () => {
    // An earlier test's glass installed it: uninstalled, it's as on a page that hasn't yet
    installPress()();
    const { rerender } = render(<Glass>Plain</Glass>);
    await settle();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(false);
    rerender(<Glass highlight>Plain</Glass>);
    await settle();
    expect(document.documentElement.hasAttribute("data-lb-interaction")).toBe(true);
  });

  it("makes a group of its root once it's in the page, and lets go of it when it goes", async () => {
    const { container, rerender } = render(
      <Glass.Group merge={24} data-testid="group">
        <Glass>A</Glass>
        <Glass>B</Glass>
      </Glass.Group>,
    );
    await settle();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe("lb lb-group");
    expect(root.style.getPropertyValue("--lb-merge")).toBe("24px");
    expect(root.hasAttribute("data-fk-surface")).toBe(true);
    expect(root.querySelector("[data-fk-part]")).not.toBeNull();
    rerender(<div />);
    await settle();
    expect(root.hasAttribute("data-fk-surface")).toBe(false);
    expect(root.querySelector("[data-fk-part]")).toBeNull();
  });

  it("gives the group to the hook", async () => {
    let seen: unknown = null;
    function Toolbar() {
      const { root, group } = useGlassGroup();
      seen = group;
      return (
        <div ref={root} className="lb lb-group">
          <div className="lb">A</div>
        </div>
      );
    }
    render(<Toolbar />);
    await settle();
    expect(seen).not.toBeNull();
  });

  it("works in strict mode, one group's elements in its root", async () => {
    const { container } = render(
      <StrictMode>
        <Glass.Group>
          <Glass>A</Glass>
        </Glass.Group>
      </StrictMode>,
    );
    await settle();
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute("data-fk-surface")).toBe(true);
    expect(root.querySelectorAll(".lb-group__glass")).toHaveLength(1);
  });

  it("gives the classes and properties for glass of your own", () => {
    expect(glass({ interactive: true, transparency: 1 })).toEqual({
      className: "lb lb-interactive",
      style: { "--lb-transparency": 1 },
    });
  });

  it("renders on the server", () => {
    const html = renderToString(
      <Glass.Group>
        <Glass interactive>A</Glass>
      </Glass.Group>,
    );
    expect(html).toContain('class="lb lb-group"');
    expect(html).toContain('class="lb lb-interactive"');
  });
});

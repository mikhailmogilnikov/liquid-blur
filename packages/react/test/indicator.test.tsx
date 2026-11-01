import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
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
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const settle = async (ms = 0) => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
  });
};
/** Where the thumb is drawn: its left edge, or null while it's away */
const thumbAt = (thumb: HTMLElement) =>
  thumb.style.visibility === "hidden" ? null : Number(/translate\(([-\d.]+)px/.exec(thumb.style.transform)?.[1]);

function Tabs(props: Parameters<typeof Indicator.Root>[0]) {
  return (
    <Indicator.Root trigger="press" {...props}>
      <Indicator.Thumb data-testid="thumb" />
      <Indicator.Item value="overview" data-x="0">
        Overview
      </Indicator.Item>
      <Indicator.Item value="releases" data-x="100">
        Releases
      </Indicator.Item>
      <Indicator.Item value="audience" data-x="200">
        Audience
      </Indicator.Item>
    </Indicator.Root>
  );
}

describe("Indicator (React)", () => {
  it("rests on the item chosen at first", async () => {
    const { getByTestId, getByText } = render(<Tabs defaultValue="releases" />);
    await settle(1000);
    expect(thumbAt(getByTestId("thumb"))).toBe(100);
    expect(getByText("Releases").hasAttribute("data-selected")).toBe(true);
  });

  it("chooses an item clicked, and rests there", async () => {
    const onValueChange = vi.fn();
    const { getByTestId, getByText } = render(<Tabs defaultValue="overview" onValueChange={onValueChange} />);
    await settle(1000);
    await act(async () => fireEvent.click(getByText("Audience")));
    await settle(1000);
    expect(onValueChange).toHaveBeenCalledWith("audience");
    expect(thumbAt(getByTestId("thumb"))).toBe(200);
    expect(getByText("Audience").hasAttribute("data-selected")).toBe(true);
    expect(getByText("Overview").hasAttribute("data-selected")).toBe(false);
  });

  it("follows `value` when controlled, and only asks to change it", async () => {
    function Controlled() {
      const [tab, setTab] = useState("overview");
      return (
        <>
          <button onClick={() => setTab("audience")}>outside</button>
          <Tabs value={tab} onValueChange={() => {}} />
        </>
      );
    }
    const { getByTestId, getByText } = render(<Controlled />);
    await settle(1000);
    // A click asks; the parent says no: it stays
    await act(async () => fireEvent.click(getByText("Releases")));
    await settle(1000);
    expect(thumbAt(getByTestId("thumb"))).toBe(0);
    // The parent changes it
    await act(async () => fireEvent.click(getByText("outside")));
    await settle(1000);
    expect(thumbAt(getByTestId("thumb"))).toBe(200);
  });

  it("follows `active`, pointed at from elsewhere, and goes back to rest on `null`", async () => {
    function Pointed({ active }: { active: string | null }) {
      return <Tabs defaultValue="overview" active={active} />;
    }
    const { getByTestId, rerender } = render(<Pointed active={null} />);
    await settle(1000);
    rerender(<Pointed active="audience" />);
    await settle(1000);
    expect(thumbAt(getByTestId("thumb"))).toBe(200);
    rerender(<Pointed active={null} />);
    await settle(1000);
    expect(thumbAt(getByTestId("thumb"))).toBe(0);
  });

  it("tells which item it's on as that changes", async () => {
    const onActiveChange = vi.fn();
    const { getByText } = render(<Tabs defaultValue="overview" onActiveChange={onActiveChange} />);
    await settle(1000);
    await act(async () => fireEvent.click(getByText("Releases")));
    await settle(1000);
    expect(onActiveChange).toHaveBeenLastCalledWith("releases");
  });

  it("takes a new trigger without being made again", async () => {
    let first: unknown = null;
    let again = false;
    function Probe({ trigger }: { trigger: "manual" | "hover" }) {
      const ind = useIndicator({ trigger });
      if (ind.engine) {
        first ??= ind.engine;
        if (first !== ind.engine) again = true;
      }
      return (
        <div ref={ind.container}>
          <span ref={ind.indicator} />
          <button ref={ind.item("a")} data-x="0">
            A
          </button>
          <button ref={ind.item("b")} data-x="100">
            B
          </button>
        </div>
      );
    }
    const { rerender, getByText } = render(<Probe trigger="manual" />);
    await settle();
    rerender(<Probe trigger="hover" />);
    await settle();
    const container = getByText("A").parentElement!;
    await act(async () => {
      container.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 150, clientY: 20 }),
      );
      vi.advanceTimersByTime(500);
    });
    expect(again).toBe(false);
    expect(container.querySelector("span")!.style.visibility).not.toBe("hidden");
  });

  it("works in strict mode", async () => {
    const { getByTestId, getByText } = render(
      <StrictMode>
        <Tabs defaultValue="overview" />
      </StrictMode>,
    );
    await settle(1000);
    await act(async () => fireEvent.click(getByText("Releases")));
    await settle(1000);
    expect(thumbAt(getByTestId("thumb"))).toBe(100);
  });

  it("renders on the server, as its markup", () => {
    const html = renderToString(<Tabs defaultValue="overview" />);
    expect(html).toContain("data-selected");
    expect(html).toContain('aria-hidden="true"');
  });

  it("knows only its own items, not a nested indicator's", async () => {
    const { getByTestId } = render(
      <Indicator.Root defaultValue="a">
        <Indicator.Thumb data-testid="outer" />
        <Indicator.Item value="a" data-x="0">
          A
        </Indicator.Item>
        <Indicator.Root defaultValue="inner" render={<div data-x="100" />}>
          <Indicator.Thumb />
          <Indicator.Item value="inner" data-x="100">
            inner
          </Indicator.Item>
        </Indicator.Root>
      </Indicator.Root>,
    );
    await settle(1000);
    expect(thumbAt(getByTestId("outer"))).toBe(0);
  });
});

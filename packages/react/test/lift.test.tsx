import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Lift, useLift } from "../src/lift";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.advanceTimersByTime(2000);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The engine is made at the end of the task its refs came in: let that end */
const settle = async (ms = 0) => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
  });
};
const layer = () => document.querySelector<HTMLDialogElement>("dialog[data-fk-lift]");
const rightClick = (el: Element) => fireEvent.contextMenu(el);

function Photo(
  props: Partial<Parameters<typeof Lift.Root>[0]> & { itemSelect?: (e: { preventDefault(): void }) => void },
) {
  const { itemSelect, ...root } = props;
  return (
    <Lift.Root {...root}>
      <Lift.Target data-testid="photo" tabIndex={0} />
      <Lift.Menu aria-label="Photo" data-testid="menu">
        <Lift.Item value="copy">Copy</Lift.Item>
        <Lift.Item value="share" onSelect={itemSelect}>
          Share
        </Lift.Item>
        <Lift.Separator />
        <Lift.Item value="delete" disabled>
          Delete
        </Lift.Item>
      </Lift.Menu>
    </Lift.Root>
  );
}

describe("Lift (React)", () => {
  it("renders its target and a hidden menu of items, and lifts on a right click", async () => {
    const onOpenChange = vi.fn();
    const { getByTestId, getAllByRole } = render(<Photo onOpenChange={onOpenChange} />);
    await settle();
    const menu = getByTestId("menu");
    expect(menu.hidden).toBe(true);
    expect(menu.getAttribute("role")).toBe("menu");
    expect(getAllByRole("menuitem", { hidden: true }).map((i) => i.dataset.value)).toEqual(["copy", "share", "delete"]);
    // The element itself: the copy lifted is a second one with its attributes
    const photo = getByTestId("photo");
    await act(async () => rightClick(photo));
    expect(layer()?.open).toBe(true);
    expect(layer()?.contains(menu)).toBe(true);
    expect(photo.dataset.state).toBe("open");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("tells the root the value chosen, and closes", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    const { getByTestId, getByText } = render(<Photo onSelect={onSelect} onOpenChange={onOpenChange} />);
    await settle();
    await act(async () => rightClick(getByTestId("photo")));
    await act(async () => fireEvent.click(getByText("Copy")));
    expect(onSelect).toHaveBeenCalledWith("copy", getByText("Copy"));
    await settle(2000);
    expect(layer()).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    // Back in place, hidden, where React put it
    expect(getByTestId("menu").hidden).toBe(true);
    expect(getByTestId("menu").parentElement?.style.display).toBe("contents");
  });

  it("keeps the menu open when an item's onSelect prevents the default", async () => {
    const onSelect = vi.fn();
    const { getByTestId, getByText } = render(<Photo onSelect={onSelect} itemSelect={(e) => e.preventDefault()} />);
    await settle();
    await act(async () => rightClick(getByTestId("photo")));
    await act(async () => fireEvent.click(getByText("Share")));
    await settle(2000);
    expect(onSelect).toHaveBeenCalledWith("share", getByText("Share"));
    expect(layer()?.open).toBe(true);
  });

  it("never chooses a disabled item", async () => {
    const onSelect = vi.fn();
    const { getByTestId, getByText } = render(<Photo onSelect={onSelect} />);
    await settle();
    await act(async () => rightClick(getByTestId("photo")));
    expect(getByText("Delete").getAttribute("aria-disabled")).toBe("true");
    await act(async () => fireEvent.click(getByText("Delete")));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("follows `open` when controlled", async () => {
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>toggle</button>
          <Photo open={open} onOpenChange={setOpen} />
        </>
      );
    }
    const { getByText } = render(<Controlled />);
    await settle();
    await act(async () => fireEvent.click(getByText("toggle")));
    expect(layer()?.open).toBe(true);
    await act(async () => fireEvent.click(getByText("toggle")));
    await settle(2000);
    expect(layer()).toBeNull();
  });

  it("takes new props without being made again: the latest callback, a new delay", async () => {
    let engine: unknown = null;
    function Probe({ delay, label }: { delay: number; label: string }) {
      const lift = useLift({
        delay,
        onSelect: () => {
          calls.push(label);
        },
      });
      engine ??= lift.lift;
      if (lift.lift) engine = engine === lift.lift ? engine : "made again";
      return (
        <>
          <div ref={lift.element} data-testid="el" />
          <div ref={lift.menu} role="menu" hidden>
            <button role="menuitem">A</button>
          </div>
        </>
      );
    }
    const calls: string[] = [];
    const { rerender, getByTestId, getByText } = render(<Probe delay={500} label="first" />);
    await settle();
    rerender(<Probe delay={100} label="second" />);
    await settle();
    expect(engine).not.toBe("made again");
    // A press held 100ms lifts it now
    await act(async () => {
      fireEvent.pointerDown(getByTestId("el"), { pointerId: 1, isPrimary: true, button: 0, clientX: 5, clientY: 5 });
      vi.advanceTimersByTime(120);
    });
    expect(layer()?.open).toBe(true);
    await act(async () => {
      fireEvent.pointerUp(window, { pointerId: 1, isPrimary: true });
      vi.advanceTimersByTime(1000);
    });
    await act(async () => fireEvent.click(getByText("A")));
    expect(calls).toEqual(["second"]);
  });

  it("can be unmounted while open, even with its menu its own element (the hook)", async () => {
    function Bare() {
      const lift = useLift();
      return (
        <>
          <div ref={lift.element} data-testid="el" />
          <div ref={lift.menu} role="menu" hidden data-testid="bare-menu">
            <button role="menuitem">A</button>
          </div>
        </>
      );
    }
    const { getByTestId, unmount } = render(<Bare />);
    await settle();
    await act(async () => rightClick(getByTestId("el")));
    expect(layer()?.contains(getByTestId("bare-menu"))).toBe(true);
    expect(() => unmount()).not.toThrow();
    expect(layer()).toBeNull();
  });

  it("lets everything go when it's unmounted", async () => {
    const { getByTestId, unmount } = render(<Photo />);
    await settle();
    await act(async () => rightClick(getByTestId("photo")));
    unmount();
    await settle(100);
    expect(layer()).toBeNull();
  });

  it("works in strict mode, made once for good", async () => {
    const { getByTestId } = render(
      <StrictMode>
        <Photo />
      </StrictMode>,
    );
    await settle();
    await act(async () => rightClick(getByTestId("photo")));
    expect(document.querySelectorAll("dialog[data-fk-lift]")).toHaveLength(1);
  });

  it("renders on the server, its menu hidden, nothing lifted", () => {
    const html = renderToString(<Photo />);
    expect(html).toContain('role="menu"');
    expect(html).toContain("hidden");
    expect(html).toContain('role="menuitem"');
  });

  it("renders a part as an element of yours, our props merged in", async () => {
    const onClick = vi.fn();
    const { getByAltText, getByTestId } = render(
      <Lift.Root>
        <Lift.Target render={<img alt="photo" className="mine" onClick={onClick} />} className="ours" />
        <Lift.Menu data-testid="menu">
          <Lift.Item value="a">A</Lift.Item>
        </Lift.Menu>
      </Lift.Root>,
    );
    await settle();
    const img = getByAltText("photo");
    expect(img.className).toBe("ours mine");
    fireEvent.click(img);
    expect(onClick).toHaveBeenCalled();
    await act(async () => rightClick(img));
    expect(layer()?.contains(getByTestId("menu"))).toBe(true);
  });
});

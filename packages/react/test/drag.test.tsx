import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Drag, useDrag, type DragRootProps } from "../src/drag";

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
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const settle = async (ms = 2000) => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
  });
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

const offset = (el: HTMLElement) => Number.parseFloat(el.style.translate.split(" ")[1] ?? "0");

function Sheet(props: Omit<DragRootProps, "children">) {
  return (
    <div>
      <Drag.Root axis="y" snaps={({ height }) => [0, height / 2, height - 76]} data-testid="sheet" {...props}>
        <Drag.Handle data-testid="grabber" />
        <Drag.Scroll data-testid="list" />
      </Drag.Root>
    </div>
  );
}

describe("Drag (React)", () => {
  it("starts at `defaultSnap`, snap points read from the room it's in", async () => {
    const { getByTestId } = render(<Sheet defaultSnap={1} />);
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(300);
    expect(getByTestId("sheet").dataset.snap).toBe("1");
  });

  it("is dragged by its handle, and tells the snap point it's let go at", async () => {
    const onSnapChange = vi.fn();
    const { getByTestId } = render(<Sheet defaultSnap={1} onSnapChange={onSnapChange} />);
    await settle();
    // On the sheet itself, not the handle: nothing
    fling(getByTestId("sheet"), 300, 260);
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(300);
    await act(async () => fling(getByTestId("grabber"), 300, 260));
    await settle();
    expect(onSnapChange).toHaveBeenCalledWith(2);
    expect(offset(getByTestId("sheet"))).toBe(524);
    expect(getByTestId("sheet").dataset.snap).toBe("2");
  });

  it("follows `snap` when controlled", async () => {
    function Controlled() {
      const [snap, setSnap] = useState(0);
      return (
        <>
          <button onClick={() => setSnap(2)}>down</button>
          <Sheet snap={snap} onSnapChange={setSnap} />
        </>
      );
    }
    const { getByTestId, getByText } = render(<Controlled />);
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(0);
    await act(async () => getByText("down").click());
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(524);
  });

  it("goes back when controlled and the parent keeps `snap` as it was", async () => {
    const onSnapChange = vi.fn();
    const { getByTestId } = render(<Sheet snap={1} onSnapChange={onSnapChange} />);
    await settle();
    await act(async () => fling(getByTestId("grabber"), 300, 260));
    await settle();
    expect(onSnapChange).toHaveBeenCalledWith(2);
    expect(offset(getByTestId("sheet"))).toBe(300);
  });

  it("follows snap points of the room that change with a render", async () => {
    function Peek({ peek }: { peek: number }) {
      return <Sheet defaultSnap={1} snaps={({ height }) => [0, height - peek]} />;
    }
    const { getByTestId, rerender } = render(<Peek peek={76} />);
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(524);
    // A new function each render, the same points: nothing; other points: followed, to the same one
    rerender(<Peek peek={76} />);
    rerender(<Peek peek={100} />);
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(500);
  });

  it("takes new props without being made again, and is made again for another axis where it was", async () => {
    const made: unknown[] = [];
    function Probe({ axis, spring }: { axis: "x" | "y"; spring: number }) {
      const drag = useDrag({ axis, snaps: [0, 100], defaultSnap: 1, spring: { duration: spring, bounce: 0 } });
      if (drag.drag && !made.includes(drag.drag)) made.push(drag.drag);
      return <div ref={drag.element} data-testid="el" />;
    }
    const { rerender, getByTestId } = render(<Probe axis="y" spring={0.4} />);
    await settle();
    rerender(<Probe axis="y" spring={0.5} />);
    rerender(<Probe axis="y" spring={0.5} />);
    await settle();
    expect(made).toHaveLength(1);
    rerender(<Probe axis="x" spring={0.5} />);
    await settle();
    expect(made).toHaveLength(2);
    expect(getByTestId("el").style.translate).toBe("100px 0px");
  });

  it("isn't dragged while disabled", async () => {
    const { getByTestId, rerender } = render(<Sheet defaultSnap={0} disabled />);
    await settle();
    fling(getByTestId("grabber"), 0, 400);
    await settle();
    expect(offset(getByTestId("sheet"))).toBe(0);
    rerender(<Sheet defaultSnap={0} />);
    await settle();
    await act(async () => fling(getByTestId("grabber"), 0, 400));
    await settle();
    expect(offset(getByTestId("sheet"))).toBeGreaterThan(0);
  });

  it("gives its element its own translate back on unmount", async () => {
    function Shown({ on }: { on: boolean }) {
      const drag = useDrag({
        snaps: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
        ],
        defaultSnap: 1,
      });
      return on ? <div ref={drag.element} data-testid="el" /> : null;
    }
    const { getByTestId, rerender } = render(<Shown on />);
    await settle();
    const el = getByTestId("el");
    expect(el.style.translate).toBe("50px 50px");
    rerender(<Shown on={false} />);
    await settle();
    expect(el.style.translate).toBe("");
  });

  it("works in strict mode", async () => {
    const onSnapChange = vi.fn();
    const { getByTestId } = render(
      <StrictMode>
        <Sheet defaultSnap={1} onSnapChange={onSnapChange} />
      </StrictMode>,
    );
    await settle();
    await act(async () => fling(getByTestId("grabber"), 300, 260));
    await settle();
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    expect(offset(getByTestId("sheet"))).toBe(524);
  });

  it("renders on the server, at offset 0", () => {
    const html = renderToString(<Sheet defaultSnap={1} />);
    expect(html).toContain('data-snap="1"');
    expect(html).not.toContain("translate");
  });
});

import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Layout, useLayout } from "../src/layout";
import { bare, column, offset } from "./column";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  column();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const quick = { duration: 0.1, bounce: 0 };
/** Made (a microtask after its root is in), and what the page changed seen */
const seen = () => act(async () => await Promise.resolve());
const settle = () =>
  act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(2000);
  });

function Todos({ initial = ["a", "b", "c"], enter }: { initial?: string[]; enter?: false }) {
  const [todos, setTodos] = useState(initial);
  return (
    <>
      <button data-testid="add" onClick={() => setTodos((t) => ["n", ...t])} />
      <button data-testid="drop" onClick={() => setTodos((t) => t.slice(1))} />
      <Layout.Root render={<ul data-root data-testid="root" />} spring={quick} enter={enter}>
        {todos.map((t) => (
          <li key={t} id={t}>
            {t}
          </li>
        ))}
      </Layout.Root>
    </>
  );
}

describe("Layout.Root", () => {
  it("renders as an element of yours, its children the items", async () => {
    const { getByTestId } = render(<Todos />);
    await seen();
    const root = getByTestId("root");
    expect(root.tagName).toBe("UL");
    expect(root.children).toHaveLength(3);
    expect(root.hasAttribute("data-moving")).toBe(false);
  });

  it("moves the rows React put in, and marks itself while it does", async () => {
    const { getByTestId } = render(
      <StrictMode>
        <Todos />
      </StrictMode>,
    );
    await seen();
    const root = getByTestId("root");
    await act(async () => getByTestId("add").click());
    await seen();
    expect(offset(document.getElementById("a")!).y).toBeCloseTo(-40);
    expect(root.hasAttribute("data-moving")).toBe(true);
    await settle();
    expect(root.hasAttribute("data-moving")).toBe(false);
    expect(bare(...root.children)).toBe(true);
  });

  it("lets one React took out go out where it was, then it's gone", async () => {
    const { getByTestId } = render(<Todos />);
    await seen();
    const a = document.getElementById("a")!;
    await act(async () => getByTestId("drop").click());
    await seen();
    expect(a.isConnected).toBe(true);
    expect(a.hasAttribute("data-fk-part")).toBe(true);
    await settle();
    expect(a.isConnected).toBe(false);
    expect(getByTestId("root").children).toHaveLength(2);
  });

  it("takes new props without being made again", async () => {
    const { getByTestId, rerender } = render(<Todos />);
    await seen();
    rerender(<Todos enter={false} />);
    await seen();
    await act(async () => getByTestId("add").click());
    await seen();
    expect(document.getElementById("n")!.style.opacity).toBe("");
  });

  it("leaves nothing of its own when unmounted on the way", async () => {
    const { getByTestId, unmount } = render(<Todos />);
    await seen();
    const b = document.getElementById("b")!;
    await act(async () => getByTestId("add").click());
    await seen();
    expect(b.style.translate).not.toBe("");
    unmount();
    expect(bare(b)).toBe(true);
  });

  it("renders on the server without anything of its own", () => {
    const html = renderToString(<Todos />);
    expect(html).toContain("<ul");
    expect(html).not.toContain("transform");
    expect(html).not.toContain("data-moving");
  });
});

describe("useLayout", () => {
  function Own() {
    const [rows, setRows] = useState(["a", "b"]);
    const layout = useLayout({ spring: quick });
    return (
      <>
        <button data-testid="add" onClick={() => setRows((r) => ["n", ...r])} />
        <div ref={layout.root} data-root data-testid="root" data-on={layout.moving ? "" : undefined}>
          {rows.map((r) => (
            <p key={r} id={r} />
          ))}
        </div>
      </>
    );
  }

  it("moves the items of a root of yours", async () => {
    const { getByTestId } = render(<Own />);
    await seen();
    await act(async () => getByTestId("add").click());
    await seen();
    expect(offset(document.getElementById("a")!).y).toBeCloseTo(-40);
    expect(getByTestId("root").hasAttribute("data-on")).toBe(true);
    await settle();
    expect(getByTestId("root").hasAttribute("data-on")).toBe(false);
  });
});

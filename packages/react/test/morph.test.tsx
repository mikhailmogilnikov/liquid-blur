import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Morph, useMorph, type MorphRootProps } from "../src/morph";

beforeEach(() => {
  // Reduced motion: the states swap at once, so a test sees where it's gone without frames
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** A microtask for the morph to be made in, and React's updates after it */
const settle = () => act(async () => await Promise.resolve());
const away = (el: HTMLElement) => el.hasAttribute("data-fk-away");

function More(props: Omit<MorphRootProps, "children">) {
  return (
    <div>
      <Morph.Root {...props}>
        <Morph.State value="button" data-testid="button" render={<Morph.Trigger value="panel" />}>
          More
        </Morph.State>
        <Morph.State value="panel" data-testid="panel">
          <Morph.Trigger value="button">Close</Morph.Trigger>
        </Morph.State>
      </Morph.Root>
    </div>
  );
}

describe("Morph (React)", () => {
  it("starts at the first state, the others away", async () => {
    const { getByTestId } = render(<More />);
    await settle();
    expect(away(getByTestId("button"))).toBe(false);
    expect(away(getByTestId("panel"))).toBe(true);
    expect(getByTestId("button").hasAttribute("data-current")).toBe(true);
  });

  it("starts at `defaultValue`", async () => {
    const { getByTestId } = render(<More defaultValue="panel" />);
    await settle();
    expect(away(getByTestId("button"))).toBe(true);
    expect(away(getByTestId("panel"))).toBe(false);
  });

  it("goes where a trigger sends it, a state rendered as one too, and tells it by value", async () => {
    const onValueChange = vi.fn();
    const onRest = vi.fn();
    const { getByTestId, getByText } = render(<More onValueChange={onValueChange} onRest={onRest} />);
    await settle();
    // The state is the trigger: a button, with its children
    expect(getByTestId("button").tagName).toBe("BUTTON");
    await act(async () => fireEvent.click(getByText("More")));
    await settle();
    expect(onValueChange).toHaveBeenCalledWith("panel");
    expect(onRest).toHaveBeenLastCalledWith("panel");
    expect(away(getByTestId("panel"))).toBe(false);
    expect(getByTestId("panel").hasAttribute("data-current")).toBe(true);
    await act(async () => fireEvent.click(getByText("Close")));
    await settle();
    expect(onRest).toHaveBeenLastCalledWith("button");
    expect(away(getByTestId("panel"))).toBe(true);
  });

  it("follows `value` when controlled, and only asks to change it", async () => {
    function Controlled() {
      const [value, setValue] = useState("button");
      return (
        <>
          <button onClick={() => setValue("panel")}>outside</button>
          <More value={value} onValueChange={() => {}} />
        </>
      );
    }
    const { getByTestId, getByText } = render(<Controlled />);
    await settle();
    // A trigger asks; the parent says no: it stays
    await act(async () => fireEvent.click(getByText("More")));
    await settle();
    expect(away(getByTestId("panel"))).toBe(true);
    // The parent changes it
    await act(async () => fireEvent.click(getByText("outside")));
    await settle();
    expect(away(getByTestId("panel"))).toBe(false);
  });

  it("resolves `to()` once it rests there, when controlled too", async () => {
    let to: ((v: string) => Promise<boolean>) | null = null;
    function Probe() {
      const [value, setValue] = useState("a");
      const morph = useMorph({ value, onValueChange: setValue });
      to = morph.to;
      return (
        <div>
          <div ref={morph.state("a")}>A</div>
          <div ref={morph.state("b")}>B</div>
        </div>
      );
    }
    render(<Probe />);
    await settle();
    let rested: boolean | null = null;
    await act(async () => {
      void to!("b").then((r) => (rested = r));
    });
    await settle();
    expect(rested).toBe(true);
  });

  it("flies once what the same handler changed is rendered: a pick relabels the pill first", async () => {
    let seen = "";
    function Sort() {
      const [sort, setSort] = useState("Newest");
      return (
        <Morph.Root defaultValue="panel" onStart={() => (seen = document.getElementById("pill")!.textContent!)}>
          <Morph.State value="pill" id="pill">
            {sort}
          </Morph.State>
          <Morph.State value="panel">
            <Morph.Trigger value="pill" onClick={() => setSort("Oldest")}>
              Oldest
            </Morph.Trigger>
          </Morph.State>
        </Morph.Root>
      );
    }
    const { getByText } = render(<Sort />);
    await settle();
    await act(async () => fireEvent.click(getByText("Oldest")));
    await settle();
    expect(seen).toBe("Oldest");
  });

  it("takes a state that comes later, and lets go of one that goes", async () => {
    function List({ items }: { items: string[] }) {
      return (
        <Morph.Root>
          <Morph.State value="dot" data-testid="dot" />
          {items.map((item) => (
            <Morph.State key={item} value={item} data-testid={item} style={{ color: "red" }} />
          ))}
        </Morph.Root>
      );
    }
    const { getByTestId, rerender, queryByTestId } = render(<List items={["a"]} />);
    await settle();
    rerender(<List items={["a", "b"]} />);
    await settle();
    expect(away(getByTestId("b"))).toBe(true);
    const a = getByTestId("a");
    rerender(<List items={["b"]} />);
    await settle();
    expect(queryByTestId("a")).toBeNull();
    // Given its own styles back as it went: nothing of the morph left on it
    expect(away(a)).toBe(false);
    expect(a.style.visibility).toBe("");
  });

  it("is made again from the others when the state it's at goes", async () => {
    function Shown({ dot }: { dot: boolean }) {
      return (
        <Morph.Root>
          {dot && <Morph.State value="dot" data-testid="dot" />}
          <Morph.State value="bar" data-testid="bar" />
        </Morph.Root>
      );
    }
    const { getByTestId, rerender } = render(<Shown dot />);
    await settle();
    expect(away(getByTestId("bar"))).toBe(true);
    rerender(<Shown dot={false} />);
    await settle();
    expect(away(getByTestId("bar"))).toBe(false);
  });

  it("takes new springs and callbacks without being made again", async () => {
    const made: unknown[] = [];
    function Probe({ duration, onRest }: { duration: number; onRest: () => void }) {
      const morph = useMorph({ spring: { grow: { x: { duration, bounce: 0 } } }, onRest });
      if (morph.morph && !made.includes(morph.morph)) made.push(morph.morph);
      return (
        <div>
          <div ref={morph.state("a")}>A</div>
          <div ref={morph.state("b")}>B</div>
        </div>
      );
    }
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe duration={0.4} onRest={first} />);
    await settle();
    rerender(<Probe duration={0.6} onRest={() => second()} />);
    rerender(<Probe duration={0.6} onRest={() => second()} />);
    await settle();
    expect(made).toHaveLength(1);
  });

  it("marks a match by its name", async () => {
    const { getByText } = render(
      <Morph.Root>
        <Morph.State value="a">
          <Morph.Match name="icon">I</Morph.Match>
          <Morph.Match>none</Morph.Match>
        </Morph.State>
      </Morph.Root>,
    );
    await settle();
    expect(getByText("I").dataset.fkMatch).toBe("icon");
    expect(getByText("none").hasAttribute("data-fk-match")).toBe(false);
  });

  it("works in strict mode", async () => {
    const { getByTestId, getByText } = render(
      <StrictMode>
        <More />
      </StrictMode>,
    );
    await settle();
    expect(away(getByTestId("panel"))).toBe(true);
    await act(async () => fireEvent.click(getByText("More")));
    await settle();
    expect(away(getByTestId("panel"))).toBe(false);
    expect(document.querySelectorAll("[data-fk-part]").length).toBeLessThanOrEqual(1);
  });

  it("renders on the server, the states as they're written", () => {
    const html = renderToString(<More />);
    expect(html).toContain('data-testid="button"');
    expect(html).toContain('data-testid="panel"');
    expect(html).not.toContain("data-fk-away");
  });
});

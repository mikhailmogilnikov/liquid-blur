import { flushSync, mount, unmount, tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import Gone from "./svelte/Gone.svelte";
import Later from "./svelte/Later.svelte";
import Matches from "./svelte/Matches.svelte";
import More from "./svelte/More.svelte";
import Refusing from "./svelte/Refusing.svelte";
import Relabel from "./svelte/Relabel.svelte";
import Springs from "./svelte/Springs.svelte";
import { reactive } from "./svelte/state.svelte";
import ToProbe from "./svelte/ToProbe.svelte";

beforeEach(() => {
  // Reduced motion: the states swap at once, so a test sees where it's gone without frames
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const settle = async () => {
  flushSync();
  await tick();
  await Promise.resolve();
  flushSync();
};
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!;
const away = (el: HTMLElement) => el.hasAttribute("data-fk-away");

describe("Morph (Svelte)", () => {
  it("starts at the first state, the others away", async () => {
    const app = mount(More, { target: document.body });
    await settle();
    expect(away(byTestId("button"))).toBe(false);
    expect(away(byTestId("panel"))).toBe(true);
    expect(byTestId("button").hasAttribute("data-current")).toBe(true);
    unmount(app);
  });

  it("starts at `defaultValue`", async () => {
    const app = mount(More, { target: document.body, props: { defaultValue: "panel" } });
    await settle();
    expect(away(byTestId("button"))).toBe(true);
    expect(away(byTestId("panel"))).toBe(false);
    unmount(app);
  });

  it("goes where a trigger sends it, a state rendered as one too, and tells it by value", async () => {
    const changes: string[] = [];
    const rests: string[] = [];
    const app = mount(More, {
      target: document.body,
      props: { onValueChange: (v: string) => changes.push(v), onRest: (at: string) => rests.push(at) },
    });
    await settle();
    // The state is the trigger: a button, with its text
    expect(byTestId("button").tagName).toBe("BUTTON");
    byText("More").click();
    await settle();
    expect(changes).toEqual(["panel"]);
    expect(rests.at(-1)).toBe("panel");
    expect(away(byTestId("panel"))).toBe(false);
    expect(byTestId("panel").hasAttribute("data-current")).toBe(true);
    byText("Close").click();
    await settle();
    expect(rests.at(-1)).toBe("button");
    expect(away(byTestId("panel"))).toBe(true);
    unmount(app);
  });

  it("follows a bound value that says no to a change, and the parent's changes", async () => {
    const props = reactive({ state: "button" });
    const app = mount(Refusing, { target: document.body, props });
    await settle();
    byText("More").click();
    await settle();
    expect(away(byTestId("panel"))).toBe(true);
    props.state = "panel";
    await settle();
    expect(away(byTestId("panel"))).toBe(false);
    unmount(app);
  });

  it("flies once what the same click changed is rendered: a pick relabels the pill first", async () => {
    const seen = { text: "" };
    const app = mount(Relabel, { target: document.body, props: { seen } });
    await settle();
    byText("Oldest").click();
    await settle();
    expect(seen.text).toBe("Oldest");
    unmount(app);
  });

  it("resolves `to()` once it rests there", async () => {
    const app = mount(ToProbe, { target: document.body }) as { to: (v: string) => Promise<boolean> };
    await settle();
    let rested: boolean | null = null;
    void app.to("b").then((r) => (rested = r));
    await settle();
    await settle();
    expect(rested).toBe(true);
    unmount(app);
  });

  it("takes a state that comes later, and lets go of one that goes", async () => {
    const props = reactive({ items: ["a"] });
    const app = mount(Later, { target: document.body, props });
    await settle();
    props.items = ["a", "b"];
    await settle();
    expect(away(byTestId("b"))).toBe(true);
    const a = byTestId("a");
    props.items = ["b"];
    await settle();
    expect(document.querySelector("[data-testid=a]")).toBeNull();
    expect(away(a)).toBe(false);
    expect(a.style.visibility).toBe("");
    unmount(app);
  });

  it("is made again from the others when the state it's at goes", async () => {
    const props = reactive({ dot: true });
    const app = mount(Gone, { target: document.body, props });
    await settle();
    expect(away(byTestId("bar"))).toBe(true);
    props.dot = false;
    await settle();
    expect(away(byTestId("bar"))).toBe(false);
    unmount(app);
  });

  it("takes new springs without being made again", async () => {
    const engines = new Set<unknown>();
    const props = reactive({ duration: 0.4, engines });
    const app = mount(Springs, { target: document.body, props });
    await settle();
    props.duration = 0.6;
    await settle();
    expect(engines.size).toBe(1);
    unmount(app);
  });

  it("marks a match by its name", async () => {
    const app = mount(Matches, { target: document.body });
    await settle();
    const spans = [...document.querySelectorAll("span")];
    expect(spans.find((s) => s.textContent === "I")!.dataset.fkMatch).toBe("icon");
    expect(spans.find((s) => s.textContent === "none")!.hasAttribute("data-fk-match")).toBe(false);
    unmount(app);
  });
});

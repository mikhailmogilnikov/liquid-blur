import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { swallowClick } from "../../src/click";
import { holdSelection } from "../../src/select";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.useRealTimers();
});

const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("holdSelection", () => {
  const root = document.documentElement.style;

  it("turns selection off on the page until it's let go, and gives the root its own styles back", () => {
    root.userSelect = "text";
    const letGo = holdSelection(document);
    expect(root.userSelect).toBe("none");
    letGo();
    expect(root.userSelect).toBe("text");
  });

  it("counts holds: the last to let go gives it back", () => {
    const a = holdSelection(document);
    const b = holdSelection(document);
    a();
    expect(root.userSelect).toBe("none");
    b();
    expect(root.userSelect).toBe("");
  });

  it("lets go once: letting go again doesn't end another's hold", () => {
    const a = holdSelection(document);
    const b = holdSelection(document);
    a();
    a();
    expect(root.userSelect).toBe("none");
    b();
    expect(root.userSelect).toBe("");
  });

  it("drops a selection already there", () => {
    const p = document.createElement("p");
    p.textContent = "Some text";
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    document.getSelection()!.addRange(range);
    expect(document.getSelection()!.rangeCount).toBe(1);
    holdSelection(document)();
    expect(document.getSelection()!.rangeCount).toBe(0);
  });
});

describe("swallowClick", () => {
  it("drops the next click, before any of the page's listeners, and lets the one after through", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const seen = vi.fn();
    button.addEventListener("click", seen);
    swallowClick(document);
    click(button);
    expect(seen).not.toHaveBeenCalled();
    click(button);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("lets a click on `except` through and keeps waiting for the next", () => {
    const item = document.createElement("button");
    const other = document.createElement("button");
    document.body.append(item, other);
    const onItem = vi.fn();
    const onOther = vi.fn();
    item.addEventListener("click", onItem);
    other.addEventListener("click", onOther);
    swallowClick(document, item);
    click(item);
    click(other);
    expect(onItem).toHaveBeenCalledTimes(1);
    expect(onOther).not.toHaveBeenCalled();
  });

  it("stops waiting after its time, or when stopped", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const seen = vi.fn();
    button.addEventListener("click", seen);
    swallowClick(document, null, 400);
    vi.advanceTimersByTime(401);
    click(button);
    const stop = swallowClick(document);
    stop();
    click(button);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

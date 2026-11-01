import { createAttachmentKey } from "svelte/attachments";
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it } from "vite-plus/test";
import { flag, mergeProps } from "../../src/helpers/props";
import Synced from "./svelte/Synced.svelte";
import { reactive } from "./svelte/state.svelte";

describe("mergeProps", () => {
  it("joins classes and styles, calls both handlers, keeps every attachment", () => {
    const calls: string[] = [];
    const a = createAttachmentKey();
    const b = createAttachmentKey();
    const merged = mergeProps(
      { class: "mine", style: "color: red", onclick: () => calls.push("mine"), [a]: () => {} },
      { class: "ours", style: "position: relative", onclick: () => calls.push("ours"), [b]: () => {}, id: "x" },
    );
    expect(merged.class).toEqual(["mine", "ours"]);
    expect(merged.style).toBe("color: red; position: relative");
    (merged.onclick as () => void)();
    expect(calls).toEqual(["mine", "ours"]);
    expect(typeof merged[a]).toBe("function");
    expect(typeof merged[b]).toBe("function");
    expect(merged.id).toBe("x");
  });

  it("leaves what's there for `undefined`", () => {
    expect(mergeProps({ id: "a" }, { id: undefined }).id).toBe("a");
  });

  it("writes a flag only when on", () => {
    expect(flag(true)).toBe("");
    expect(flag(false)).toBeUndefined();
  });
});

describe("syncSettings", () => {
  it("hands an engine only what changed, once it's made", () => {
    const sets: Array<{ speed?: number }> = [];
    const props = reactive({ speed: 1, onSet: (s: { speed?: number }) => sets.push(s) });
    const app = mount(Synced, { target: document.body, props });
    flushSync();
    expect(sets).toEqual([]);
    props.speed = 2;
    flushSync();
    expect(sets).toEqual([{ speed: 2 }]);
    unmount(app);
  });
});

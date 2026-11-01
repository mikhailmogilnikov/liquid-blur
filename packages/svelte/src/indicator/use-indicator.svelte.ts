import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { elementRef, syncSettings } from "../helpers/index.js";
import { createIndicator, type Indicator as IndicatorEngine, type IndicatorSettings } from "@fluidkit/core";

/** The attribute that marks a root's items, so a selector finds its own and not a nested root's */
const ITEM = "data-fk-indicator-item";
/** Each indicator's own mark for its items. Set by attachments, in the browser only */
let made = 0;

export type UseIndicatorOptions<V extends string = string> = Omit<IndicatorSettings, "items" | "onChange"> & {
  /** The item chosen, from the parent: where it rests. Without it, the choice is its own */
  value?: V | null;
  /** Chosen at first, when the choice is its own. Not what the items' type is read from */
  defaultValue?: NoInfer<V> | null;
  /** An item chosen: by a click on it, or a press let go on it */
  onValueChange?: (value: V) => void;
  /** An item pointed at by something else, followed; `null`, back to rest */
  active?: V | null;
  /** The item it's on changed: pointed at, focused, chosen, or `null` gone */
  onActiveChange?: (value: V | null) => void;
};

export type UseIndicator<V extends string = string> = {
  /** For the container its items and the indicator are in: `{@attach tabs.container}` */
  container: Attachment;
  /** For the indicator */
  indicator: Attachment;
  /** For an item, known by its value: `{@attach tabs.item("overview")}` */
  item(value: V): Attachment;
  /** The item chosen */
  readonly value: V | null;
  /** The item it's on now, or `null` */
  readonly active: V | null;
  /** Chooses an item, as a click on it would */
  select(value: V): void;
  /** The engine, once its elements are in the page */
  readonly engine: IndicatorEngine | null;
};

const settingsOf = <V extends string>({
  value: _v,
  defaultValue: _d,
  onValueChange: _c,
  active: _a,
  onActiveChange: _ac,
  ...settings
}: UseIndicatorOptions<V>) => settings;

/**
 * An indicator on elements of yours: attach its attachments to them, each item's with its value.
 * Options are a getter, read again as what it reads changes. In a component's script
 *
 *   const tabs = useIndicator(() => ({ trigger: "press" }));
 *   <div {@attach tabs.container}>
 *     <span {@attach tabs.indicator} class="thumb"></span>
 *     <button {@attach tabs.item("overview")}>Overview</button>
 *   </div>
 */
export function useIndicator<V extends string = string>(
  options: () => UseIndicatorOptions<V> = () => ({}),
): UseIndicator<V> {
  const id = `fk-indicator-${++made}`;
  const container = elementRef();
  const indicator = elementRef();
  // The choice: the parent's when it gives one, its own otherwise
  let own = $state<V | null>(untrack(() => options().defaultValue ?? null));
  const value = $derived.by(() => {
    const given = options().value;
    return given === undefined ? own : given;
  });
  let active = $state<V | null>(null);
  /** The items, both ways; `version` changes as they come and go, for what follows them */
  const items = { byValue: new Map<V, HTMLElement>(), byElement: new Map<HTMLElement, V>() };
  let version = $state(0);
  let engine = $state.raw<IndicatorEngine | null>(null);
  const taken: { current: ReturnType<typeof settingsOf<V>> | null } = { current: null };

  const select = (v: V) => {
    if (untrack(() => options().value) === undefined) own = v;
    untrack(() => options()).onValueChange?.(v);
  };

  // Made once its container and indicator are in the page, and again for others
  $effect(() => {
    const box = container.current;
    const thumb = indicator.current;
    if (!box || !thumb) return;
    const made_ = untrack(() => {
      const settings = settingsOf(options());
      const chosen = value;
      const created = createIndicator({
        ...settings,
        container: box,
        indicator: thumb,
        items: `[${ITEM}="${CSS.escape(id)}"]`,
        rest: chosen === null ? null : (items.byValue.get(chosen) ?? null),
        onChange: (item) => {
          const v = item ? (items.byElement.get(item) ?? null) : null;
          active = v;
          options().onActiveChange?.(v);
        },
      });
      taken.current = settings;
      return created;
    });
    engine = made_;
    return () => {
      made_.destroy();
      if (engine === made_) engine = null;
    };
  });

  syncSettings(
    () => engine,
    () => settingsOf(options()),
    taken,
  );

  // Where it rests: the item chosen, as it changes or its element does
  $effect(() => {
    const made_ = engine;
    const chosen = value;
    void version;
    if (!made_) return;
    untrack(() => {
      const el = chosen === null ? null : (items.byValue.get(chosen) ?? null);
      if (made_.rest !== el) made_.rest = el;
    });
  });

  // Pointed at by something else: followed, and back to rest when it's `null`
  $effect(() => {
    const made_ = engine;
    const pointed = options().active;
    if (!made_ || pointed === undefined) return;
    untrack(() => made_.to(pointed === null ? made_.rest : (items.byValue.get(pointed) ?? null)));
  });

  // One attachment per value, so an item isn't let go and taken again each update
  const attachments = new Map<V, Attachment>();
  const item = (v: V) => {
    let attach = attachments.get(v);
    if (!attach) {
      attach = (node) => {
        const el = node as HTMLElement;
        el.setAttribute(ITEM, id);
        items.byValue.set(v, el);
        items.byElement.set(el, v);
        // Untracked: an attachment runs in an effect, which would otherwise rerun with every item
        untrack(() => version++);
        // A click chooses it: a press let go on it clicks it too
        const onClick = () => select(v);
        el.addEventListener("click", onClick);
        return () => {
          el.removeEventListener("click", onClick);
          el.removeAttribute(ITEM);
          if (items.byValue.get(v) === el) items.byValue.delete(v);
          items.byElement.delete(el);
          untrack(() => version++);
        };
      };
      attachments.set(v, attach);
    }
    return attach;
  };

  return {
    container: container.attach,
    indicator: indicator.attach,
    item,
    get value() {
      return value;
    },
    get active() {
      return active;
    },
    select,
    get engine() {
      return engine;
    },
  };
}

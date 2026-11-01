/**
 * Indicator for Vue: `<Indicator.Root>` and its parts by default, `useIndicator()` for markup of
 * your own.
 *
 *   <Indicator.Root v-model="tab" trigger="press">
 *     <Indicator.Thumb class="thumb" />
 *     <Indicator.Item value="overview">Overview</Indicator.Item>
 *     <Indicator.Item value="releases">Releases</Indicator.Item>
 *   </Indicator.Root>
 *
 * Items are known by their `value`. `v-model` is the one chosen, where the indicator rests: a click
 * on an item chooses it (a press dragged across and let go on one, too). `active` is one pointed at
 * by something else, the finger on a lift's menu, say, followed as it changes.
 */
import {
  defineComponent,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  useId,
  watch,
  watchPostEffect,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
  type ShallowRef,
  type SlotsType,
} from "vue";
import { attachRef, batched, flag, renderPart, useControllable, watchSettings, type FunctionRef } from "./helpers";
import {
  createIndicator,
  type Indicator as IndicatorEngine,
  type IndicatorSettings,
  type IndicatorSprings,
  type IndicatorTrigger,
} from "@fluidkit/core";

/** The attribute that marks a root's items, so a selector finds its own and not a nested root's */
const ITEM = "data-fk-indicator-item";

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
  /** The ref for the container its items and the indicator are in: `:ref="tabs.container"` */
  container: FunctionRef;
  /** The ref for the indicator */
  indicator: FunctionRef;
  /** The ref for an item, known by its value */
  item(value: V): FunctionRef;
  /** The item chosen */
  value: Readonly<ComputedRef<V | null>>;
  /** The item it's on now, or `null` */
  active: Readonly<Ref<V | null>>;
  /** Chooses an item, as a click on it would */
  select(value: V): void;
  /** The engine, once its elements are in the page */
  engine: Readonly<ShallowRef<IndicatorEngine | null>>;
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
 * An indicator on elements of yours: give its refs to them, each item's with its value. Options can
 * be a ref or a getter, read again as they change
 */
export function useIndicator<V extends string = string>(
  options: MaybeRefOrGetter<UseIndicatorOptions<V>> = {},
): UseIndicator<V> {
  const latest = () => toValue(options);
  // The same on the server and in the browser, so the items' marks hydrate
  const id = useId();
  const chosen = useControllable<V | null>(
    () => latest().value,
    latest().defaultValue ?? null,
    (v) => {
      if (v !== null) latest().onValueChange?.(v);
    },
  );
  const active = shallowRef(null) as Ref<V | null>;
  const els: { container: HTMLElement | null; indicator: HTMLElement | null } = { container: null, indicator: null };
  /** The items, both ways; `version` changes as they come and go, for what follows them */
  const items = { byValue: new Map<V, HTMLElement>(), byElement: new Map<HTMLElement, V>() };
  const version = shallowRef(0);
  let made: { engine: IndicatorEngine; container: HTMLElement; indicator: HTMLElement } | null = null;
  const taken: { current: ReturnType<typeof settingsOf<V>> | null } = { current: null };
  const engine = shallowRef<IndicatorEngine | null>(null);
  let disposed = false;

  const letGo = () => {
    made?.engine.destroy();
    made = null;
    engine.value = null;
  };

  const sync = batched(() => {
    if (disposed) return;
    const { container, indicator } = els;
    if (made && (made.container !== container || made.indicator !== indicator)) letGo();
    if (!made && container && indicator) {
      const settings = settingsOf(latest());
      const value = chosen.value.value;
      const made_ = createIndicator({
        ...settings,
        container,
        indicator,
        items: `[${ITEM}="${CSS.escape(id)}"]`,
        rest: value === null ? null : (items.byValue.get(value) ?? null),
        onChange: (item) => {
          const v = item ? (items.byElement.get(item) ?? null) : null;
          active.value = v;
          latest().onActiveChange?.(v);
        },
      });
      taken.current = settings;
      made = { engine: made_, container, indicator };
      engine.value = made_;
    }
  });

  const bind = (key: keyof typeof els) =>
    attachRef((el) => {
      els[key] = el;
      sync();
      return () => {
        if (els[key] === el) els[key] = null;
        sync();
      };
    });

  const select = (v: V) => chosen.set(v);

  // One ref per value, so an item isn't let go and taken again each render
  const refs = new Map<V, FunctionRef>();
  const item = (v: V) => {
    let ref = refs.get(v);
    if (!ref) {
      ref = attachRef((el) => {
        el.setAttribute(ITEM, id);
        items.byValue.set(v, el);
        items.byElement.set(el, v);
        version.value++;
        // A click chooses it: a press let go on it clicks it too
        const onClick = () => select(v);
        el.addEventListener("click", onClick);
        return () => {
          el.removeEventListener("click", onClick);
          el.removeAttribute(ITEM);
          if (items.byValue.get(v) === el) items.byValue.delete(v);
          items.byElement.delete(el);
          version.value++;
        };
      });
      refs.set(v, ref);
    }
    return ref;
  };

  watchSettings(engine, () => settingsOf(latest()), taken);

  // Where it rests: the item chosen, as it changes or its element does
  watchPostEffect(() => {
    const made_ = engine.value;
    const value = chosen.value.value;
    void version.value;
    if (!made_) return;
    const el = value === null ? null : (items.byValue.get(value) ?? null);
    if (made_.rest !== el) made_.rest = el;
  });

  // Pointed at by something else: followed, and back to rest when it's `null`
  watch(
    [engine, () => latest().active],
    ([made_, pointed]) => {
      if (!made_ || pointed === undefined) return;
      const el = pointed === null ? made_.rest : (items.byValue.get(pointed) ?? null);
      made_.to(el);
    },
    { flush: "post" },
  );

  onScopeDispose(() => {
    disposed = true;
    letGo();
  });

  return {
    container: bind("container"),
    indicator: bind("indicator"),
    item,
    value: chosen.value,
    active,
    select,
    engine,
  };
}

// ── Components ──

const IndicatorKey: InjectionKey<UseIndicator> = Symbol("fluidkit-indicator");

function useIndicatorContext(part: string) {
  const context = inject(IndicatorKey, null);
  if (!context) throw new Error(`Indicator.${part} has to be inside <Indicator.Root>`);
  return context;
}

const asChild = { type: Boolean, default: false } as const;

/** What the root's slot gets */
export type IndicatorRootState = { value: string | null; active: string | null };

/** The container of its items and its indicator: a `div`, or with `as-child` the element in its slot */
const Root = defineComponent({
  name: "IndicatorRoot",
  inheritAttrs: false,
  props: {
    /** The item chosen, where it rests: controlled, with `v-model`. Without it, the choice is its own */
    modelValue: { type: [String, null] as PropType<string | null>, default: undefined },
    /** Chosen at first, when the choice is its own */
    defaultValue: { type: [String, null] as PropType<string | null>, default: null },
    /** An item pointed at by something else, followed; `null`, back to rest */
    active: { type: [String, null] as PropType<string | null>, default: undefined },
    /** What moves it: `auto` (hover for a mouse, press for a finger) unless given */
    trigger: String as PropType<IndicatorTrigger>,
    /** With press, an item it's released over is clicked; on unless `false` */
    click: { type: Boolean, default: undefined },
    /** Keyboard focus that shows moves it; on unless `false` or manual */
    focus: { type: Boolean, default: undefined },
    /** Springs for `x`, `y`, `width`, `height` and `presence` */
    spring: Object as PropType<Partial<IndicatorSprings>>,
    asChild,
  },
  emits: {
    /** An item chosen: by a click, or a press let go on it */
    "update:modelValue": (_value: string) => true,
    /** The item it's on changed, whatever put it there, or `null` gone */
    activeChange: (_value: string | null) => true,
  },
  slots: Object as SlotsType<{ default: IndicatorRootState }>,
  setup(props, { attrs, slots, emit }) {
    const indicator = useIndicator(() => ({
      value: props.modelValue,
      defaultValue: props.defaultValue,
      active: props.active,
      trigger: props.trigger,
      click: props.click,
      focus: props.focus,
      spring: props.spring,
      onValueChange: (value) => emit("update:modelValue", value),
      onActiveChange: (value) => emit("activeChange", value),
    }));
    provide(IndicatorKey, indicator);
    return () =>
      renderPart(
        "div",
        { ...attrs, ref: indicator.container, style: [{ position: "relative" }, attrs.style] },
        props.asChild,
        slots,
        { value: indicator.value.value, active: indicator.active.value },
      );
  },
});

/** The one element that flies onto the items: a `span`, under them */
const Thumb = defineComponent({
  name: "IndicatorThumb",
  inheritAttrs: false,
  props: { asChild },
  setup(props, { attrs, slots }) {
    const indicator = useIndicatorContext("Thumb");
    return () =>
      renderPart(
        "span",
        {
          "aria-hidden": "true",
          ...attrs,
          ref: indicator.indicator,
          style: [{ position: "absolute", zIndex: -1 }, attrs.style],
        },
        props.asChild,
        slots,
        {},
      );
  },
});

export type IndicatorItemState = { selected: boolean; active: boolean };

/** An item: a `button`, or with `as-child` the element in its slot; chosen by a click */
const Item = defineComponent({
  name: "IndicatorItem",
  inheritAttrs: false,
  props: {
    /** What it's known by: what `v-model` says */
    value: { type: String, required: true },
    asChild,
  },
  slots: Object as SlotsType<{ default: IndicatorItemState }>,
  setup(props, { attrs, slots }) {
    const indicator = useIndicatorContext("Item");
    return () => {
      const selected = indicator.value.value === props.value;
      const active = indicator.active.value === props.value;
      return renderPart(
        "button",
        {
          type: "button",
          ...attrs,
          ref: indicator.item(props.value),
          "data-selected": flag(selected),
          "data-active": flag(active),
        },
        props.asChild,
        slots,
        { selected, active },
      );
    };
  },
});

/** The indicator's state and refs inside `<Indicator.Root>`: for a part of your own */
export function useIndicatorParts() {
  return useIndicatorContext("parts");
}

/** Indicator's parts: `Root`, `Thumb`, `Item` */
export const Indicator = { Root, Thumb, Item };

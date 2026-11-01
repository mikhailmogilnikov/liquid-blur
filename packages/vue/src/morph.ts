/**
 * Morph for Vue: `<Morph.Root>` and its parts by default, `useMorph()` for markup of your own.
 *
 *   <Morph.Root v-model="state">
 *     <Morph.State value="button" class="lb" as-child>
 *       <Morph.Trigger value="panel">More</Morph.Trigger>
 *     </Morph.State>
 *     <Morph.State value="panel" class="lb panel">
 *       <Morph.Trigger value="button">Close</Morph.Trigger>
 *     </Morph.State>
 *   </Morph.Root>
 *
 * States are known by their `value`. `v-model` is the one asked for, as the engine's `current`: it
 * changes at once, and the shape flows there once it's rendered. The morph is made once a state is in
 * the page and given new props with `set()`, never made again for them; a state that comes later is
 * added to it, one that goes is let go of. The one it's at going makes it again, from the others.
 */
import {
  computed,
  defineComponent,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  unref,
  watch,
  watchPostEffect,
  type ComputedRef,
  type InjectionKey,
  type MaybeRef,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
  type ShallowRef,
  type SlotsType,
} from "vue";
import { attachRef, batched, flag, renderPart, watchSettings, type FunctionRef } from "./helpers";
import { createMorph, type Morph as MorphEngine, type MorphMove, type MorphSettings } from "@fluidkit/core";

export type UseMorphOptions<V extends string = string> = Pick<MorphSettings, "spring"> & {
  /** The state asked for, from the parent. Without it, it's its own */
  value?: V;
  /**
   * The state shown at first, when it's its own; the first one in the page unless given. Not what
   * the states' type is read from: `useMorph({ defaultValue: "a" })` still takes `to("b")`
   */
  defaultValue?: NoInfer<V>;
  /** A state asked for: by a trigger, or `to()` */
  onValueChange?: (value: V) => void;
  /** Where the shape goes instead of next to the state it sets off from: out of a parent that would clip it */
  container?: MaybeRef<HTMLElement | null | undefined>;
  /** A flight set off, turning around or heading elsewhere included */
  onStart?: (to: V, from: V) => void;
  /** It came to rest as a state */
  onRest?: (at: V) => void;
  /** Every frame of a flight: how far along it is toward `to`, 0 to 1. `from` is `null` when it started over mid-way */
  onProgress?: (progress: number, to: V, from: V | null) => void;
};

export type UseMorph<V extends string = string> = {
  /** The ref for a state, known by its value: `:ref="morph.state('panel')"` */
  state(value: V): FunctionRef;
  /** The state asked for; `null` until one is in the page, when it's its own */
  value: Readonly<ComputedRef<V | null>>;
  /** A flight is under way */
  moving: Readonly<Ref<boolean>>;
  /** Flows into a state. Resolves when it comes to rest: `true` there, `false` if it was sent elsewhere first */
  to(value: V, move?: MorphMove): Promise<boolean>;
  /** The engine, once a state is in the page */
  morph: Readonly<ShallowRef<MorphEngine | null>>;
};

/**
 * A morph on elements of yours: give each state its ref, with its value. Options can be a ref or a
 * getter, read again as they change
 */
export function useMorph<V extends string = string>(options: MaybeRefOrGetter<UseMorphOptions<V>> = {}): UseMorph<V> {
  const latest = () => toValue(options);
  const own = shallowRef(latest().defaultValue ?? null) as Ref<V | null>;
  const value = computed(() => latest().value ?? own.value);
  const moving = shallowRef(false);
  /** The states, both ways, in the order they came */
  const states = { byValue: new Map<V, HTMLElement>(), byElement: new Map<HTMLElement, V>() };
  let made: { morph: MorphEngine; container: HTMLElement | null } | null = null;
  const taken: { current: Pick<MorphSettings, "spring"> | null } = { current: null };
  const morph = shallowRef<MorphEngine | null>(null);
  /** Asked for by `to()`, before the value was rendered: resolved once it's flown */
  let waiting: { value: V; move?: MorphMove; resolve: (rested: boolean) => void }[] = [];
  let disposed = false;

  const valueOf = (el: HTMLElement) => states.byElement.get(el) as V;
  const containerOf = () => unref(latest().container) ?? null;
  const letGo = () => {
    made?.morph.destroy();
    made = null;
    morph.value = null;
  };

  /** Made, made again or let go, as its states and container came and went in the last render */
  const sync = batched(() => {
    if (disposed) return;
    const container = containerOf();
    if (made && made.container !== container) letGo();
    if (made || !states.byValue.size) return;
    const asked = value.value;
    const initial = (asked !== null && states.byValue.get(asked)) || states.byValue.values().next().value!;
    const spring = latest().spring;
    const engine = createMorph({
      states: [...states.byValue.values()],
      initial,
      container: container ?? undefined,
      spring,
      // Always the latest options', so new callbacks never make it again
      onStart: (to, from) => {
        moving.value = true;
        latest().onStart?.(valueOf(to), valueOf(from));
      },
      onRest: (at) => {
        moving.value = false;
        latest().onRest?.(valueOf(at));
      },
      onProgress: (progress, to, from) => latest().onProgress?.(progress, valueOf(to), from && valueOf(from)),
    });
    taken.current = { spring };
    made = { morph: engine, container };
    morph.value = engine;
    // Nothing said where it starts: where it's made is its value now
    if (value.value === null) own.value = valueOf(initial);
  });

  // One ref per value, so a state isn't let go and taken again each render
  const refs = new Map<V, FunctionRef>();
  const state = (v: V) => {
    let ref = refs.get(v);
    if (!ref) {
      ref = attachRef((el) => {
        states.byValue.set(v, el);
        states.byElement.set(el, v);
        if (made) made.morph.add(el);
        else sync();
        // Vue lets refs go before it takes elements out: the state's own styles are back by then.
        // The one it's at can't be let go of: the morph is made again, from the others
        return () => {
          if (states.byValue.get(v) === el) states.byValue.delete(v);
          if (made?.morph.current === el) {
            letGo();
            sync();
          } else made?.morph.remove(el);
          states.byElement.delete(el);
        };
      });
      refs.set(v, ref);
    }
    return ref;
  };

  watchSettings(morph, () => ({ spring: latest().spring }), taken);

  // A container of another element: made again there
  watchPostEffect(() => {
    if (made && made.container !== containerOf()) sync();
  });

  // Where it's asked to be, once that's rendered; what was waiting for it hears how it went
  watch(
    [morph, value],
    ([engine, asked]) => {
      if (!engine || asked === null) return;
      const el = states.byValue.get(asked);
      if (!el) return;
      const waiters = waiting;
      waiting = [];
      const flown = engine.to(el, waiters.find((w) => w.value === asked)?.move);
      for (const w of waiters) {
        if (w.value === asked) void flown.then(w.resolve);
        else w.resolve(false);
      }
    },
    { flush: "post" },
  );

  const to = (v: V, move?: MorphMove): Promise<boolean> => {
    const el = states.byValue.get(v);
    if (!made || !el) return Promise.resolve(false);
    // Asked for already: no render to wait for
    if (value.value === v) return made.morph.to(el, move);
    latest().onValueChange?.(v);
    if (latest().value === undefined) own.value = v;
    return new Promise((resolve) => waiting.push({ value: v, move, resolve }));
  };

  onScopeDispose(() => {
    disposed = true;
    letGo();
    for (const w of waiting) w.resolve(false);
  });

  return { state, value, moving, to, morph };
}

// ── Components ──

const MorphKey: InjectionKey<UseMorph> = Symbol("fluidkit-morph");

function useMorphContext(part: string) {
  const context = inject(MorphKey, null);
  if (!context) throw new Error(`Morph.${part} has to be inside <Morph.Root>`);
  return context;
}

const asChild = { type: Boolean, default: false } as const;

/** The morph: its props and state, for the states and triggers inside it. Renders nothing of its own */
const Root = defineComponent({
  name: "MorphRoot",
  props: {
    /** The state asked for: controlled, with `v-model`. Without it, it's its own */
    modelValue: { type: String, default: undefined },
    /** The state shown at first, when it's its own; the first one in the page unless given */
    defaultValue: String,
    /** Springs growing into a bigger box and shrinking into a smaller one */
    spring: Object as PropType<MorphSettings["spring"]>,
    /** Where the shape goes instead of next to the state it sets off from */
    container: { type: null as unknown as PropType<HTMLElement | Ref<HTMLElement | null> | null>, default: undefined },
  },
  emits: {
    /** A state asked for */
    "update:modelValue": (_value: string) => true,
    /** A flight set off */
    start: (_to: string, _from: string) => true,
    /** It came to rest as a state */
    rest: (_at: string) => true,
    /** Every frame of a flight */
    progress: (_progress: number, _to: string, _from: string | null) => true,
  },
  slots: Object as SlotsType<{ default: { value: string | null; moving: boolean } }>,
  setup(props, { emit, slots }) {
    const morph = useMorph(() => ({
      value: props.modelValue,
      defaultValue: props.defaultValue,
      spring: props.spring,
      container: props.container ?? undefined,
      onValueChange: (value) => emit("update:modelValue", value),
      onStart: (to, from) => emit("start", to, from),
      onRest: (at) => emit("rest", at),
      onProgress: (progress, to, from) => emit("progress", progress, to, from),
    }));
    provide(MorphKey, morph);
    return () => slots.default?.({ value: morph.value.value, moving: morph.moving.value });
  },
});

export type MorphStateState = { current: boolean; moving: boolean };

/**
 * A state: laid out where and as it is at rest, a `div`, or with `as-child` the element in its slot.
 * Marked `data-current` while it's the one asked for. Keep its hiding (`visibility: hidden`) in CSS,
 * not in `style`: away, a state's inline opacity and visibility are the morph's
 */
const State = defineComponent({
  name: "MorphState",
  inheritAttrs: false,
  props: {
    /** What it's known by: what `v-model` says */
    value: { type: String, required: true },
    asChild,
  },
  slots: Object as SlotsType<{ default: MorphStateState }>,
  setup(props, { attrs, slots }) {
    const morph = useMorphContext("State");
    return () => {
      const current = morph.value.value === props.value;
      return renderPart(
        "div",
        { ...attrs, ref: morph.state(props.value), "data-current": flag(current) },
        props.asChild,
        slots,
        { current, moving: morph.moving.value },
      );
    };
  },
});

/** Sends the morph to a state when it's clicked: a `button`, or with `as-child` the element in its slot */
const Trigger = defineComponent({
  name: "MorphTrigger",
  inheritAttrs: false,
  props: {
    /** The state it sends the morph to */
    value: { type: String, required: true },
    /** There at once, as with reduced motion */
    instant: Boolean,
    asChild,
  },
  slots: Object as SlotsType<{ default: { current: boolean } }>,
  setup(props, { attrs, slots }) {
    const morph = useMorphContext("Trigger");
    // Your own click first: `preventDefault()` in it keeps the morph where it is
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented) void morph.to(props.value, props.instant ? { instant: true } : undefined);
    };
    return () =>
      renderPart(
        "button",
        { type: "button", ...attrs, onClick: [attrs.onClick, onClick].flat().filter(Boolean) },
        props.asChild,
        slots,
        { current: morph.value.value === props.value },
      );
  },
});

/** A piece that flies from one state into the other, to its match of the same `name`: a `span` */
const Match = defineComponent({
  name: "MorphMatch",
  inheritAttrs: false,
  props: {
    /** Flies to the match of the same name in the other state; none without one */
    name: String,
    asChild,
  },
  setup(props, { attrs, slots }) {
    return () => renderPart("span", { ...attrs, "data-fk-match": props.name }, props.asChild, slots, {});
  },
});

/** The morph's state and refs inside `<Morph.Root>`: for a part of your own */
export function useMorphParts() {
  return useMorphContext("parts");
}

/** Morph's parts: `Root`, `State`, `Trigger`, `Match` */
export const Morph = { Root, State, Trigger, Match };

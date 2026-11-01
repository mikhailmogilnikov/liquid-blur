/**
 * Layout for Vue: `<Layout.Root>` by default, `useLayout()` for markup of your own.
 *
 *   <Layout.Root as-child>
 *     <ul class="list"><li v-for="todo in todos" :key="todo.id">{{ todo.text }}</li></ul>
 *   </Layout.Root>
 *
 * Its items are its children (or what `items` selects in it): rows Vue puts in, takes out or moves
 * by their keys, classes it changes, sizes that change, all followed as the page changes them. The
 * layout is made once its root is in the page and given new props with `set()`, never made again
 * for them; another root or `items` makes it again.
 */
import {
  defineComponent,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  watchPostEffect,
  type InjectionKey,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
  type ShallowRef,
  type SlotsType,
} from "vue";
import { attachRef, batched, flag, renderPart, watchSettings, type FunctionRef } from "./helpers";
import {
  createLayout,
  type Layout as LayoutEngine,
  type LayoutSettings,
  type SpringParams,
  type TransitionParams,
} from "@fluidkit/core";

export type UseLayoutOptions = LayoutSettings & {
  /** Its items, as a selector inside the root: its children unless given */
  items?: string;
};

export type UseLayout = {
  /** The ref for the root whose items move: `:ref="layout.root"` */
  root: FunctionRef;
  /** Something is on its way */
  moving: Readonly<Ref<boolean>>;
  /** Reads the layout again and follows it: for a change no watcher sees */
  update(): void;
  /** The engine, once its root is in the page */
  layout: Readonly<ShallowRef<LayoutEngine | null>>;
};

/** Settings as the engine takes them: the function's own options and the callbacks left out */
const settingsOf = ({ items: _i, onStart: _s, onRest: _r, ...settings }: UseLayoutOptions): LayoutSettings => settings;

/**
 * A layout on a root of yours: give its ref to it. Options can be a ref or a getter, read again as
 * they change
 */
export function useLayout(options: MaybeRefOrGetter<UseLayoutOptions> = {}): UseLayout {
  const latest = () => toValue(options);
  const moving = shallowRef(false);
  const layout = shallowRef<LayoutEngine | null>(null);
  const taken: { current: LayoutSettings | null } = { current: null };
  let el: HTMLElement | null = null;
  let made: { layout: LayoutEngine; root: HTMLElement; items: string | undefined } | null = null;
  let disposed = false;

  const letGo = () => {
    made?.layout.destroy();
    made = null;
    layout.value = null;
    moving.value = false;
  };

  /** Made, made again or let go, as its root came and went in the last render */
  const sync = batched(() => {
    if (disposed) return;
    const items = latest().items;
    if (made) {
      if (made.root === el && made.items === items) return;
      letGo();
    }
    if (!el) return;
    const settings = settingsOf(latest());
    const engine = createLayout({
      ...settings,
      root: el,
      items,
      // Always the latest options', so new callbacks never make it again
      onStart: () => {
        moving.value = true;
        latest().onStart?.();
      },
      onRest: () => {
        moving.value = false;
        latest().onRest?.();
      },
    });
    taken.current = settings;
    made = { layout: engine, root: el, items };
    layout.value = engine;
  });

  const root = attachRef((node) => {
    el = node;
    sync();
    return () => {
      if (el === node) el = null;
      // Its root going: let go now, everything of the layout's off it before Vue takes it out
      if (made?.root === node) letGo();
      sync();
    };
  });

  watchSettings(layout, () => settingsOf(latest()), taken);

  // Another selector: made again
  watchPostEffect(() => {
    const items = latest().items;
    if (made && made.items !== items) sync();
  });

  onScopeDispose(() => {
    disposed = true;
    letGo();
  });

  return { root, moving, update: () => made?.layout.update(), layout };
}

// ── Components ──

const LayoutKey: InjectionKey<UseLayout> = Symbol("fluidkit-layout");

/** What the root's slot gets */
export type LayoutState = { moving: boolean };

/**
 * The root whose items move: a `div`, or with `as-child` the element in its slot, its children the
 * items. Marked `data-moving` while something is on its way
 */
const Root = defineComponent({
  name: "LayoutRoot",
  inheritAttrs: false,
  props: {
    /** Its items, as a selector inside it: its children unless given */
    items: String,
    /** The spring everything moves on */
    spring: Object as PropType<SpringParams>,
    /** Sizes change on the spring too; `false`, at once, and only positions move */
    size: { type: Boolean, default: undefined },
    /** How a new item comes in: `transitions.scale()` unless given; `false`, it's there at once */
    enter: { type: [Object, Boolean] as PropType<TransitionParams | false>, default: undefined },
    /** How an item taken out goes: `transitions.scale()` unless given; `false`, it's gone at once */
    exit: { type: [Object, Boolean] as PropType<TransitionParams | false>, default: undefined },
    asChild: { type: Boolean, default: false },
  },
  emits: {
    /** Something set off moving, from rest */
    start: () => true,
    /** Everything has come to rest */
    rest: () => true,
  },
  slots: Object as SlotsType<{ default: LayoutState }>,
  setup(props, { attrs, slots, emit }) {
    const layout = useLayout(() => ({
      items: props.items,
      spring: props.spring,
      size: props.size,
      enter: props.enter,
      exit: props.exit,
      onStart: () => emit("start"),
      onRest: () => emit("rest"),
    }));
    provide(LayoutKey, layout);
    return () =>
      renderPart(
        "div",
        { ...attrs, ref: layout.root, "data-moving": flag(layout.moving.value) },
        props.asChild,
        slots,
        {
          moving: layout.moving.value,
        },
      );
  },
});

/** The layout inside `<Layout.Root>`: for a part of your own */
export function useLayoutParts() {
  const context = inject(LayoutKey, null);
  if (!context) throw new Error("useLayoutParts() has to be inside <Layout.Root>");
  return context;
}

/** Layout's part: `Root` */
export const Layout = { Root };

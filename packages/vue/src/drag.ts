/**
 * Drag for Vue: `<Drag.Root>` and its parts by default, `useDrag()` for markup of your own.
 *
 *   <Drag.Root v-model:snap="snap" axis="y" :snaps="({ height }) => [0, height / 2, height - 76]">
 *     <Drag.Handle class="grabber" />
 *     <Drag.Scroll as-child><ul>…</ul></Drag.Scroll>
 *   </Drag.Root>
 *
 * The root is what moves. Snap points and bounds can be functions of the room it's in (its parent's
 * size): read again on a resize, and after a render that changes what they give. `snap` is the snap
 * point it's at or heads for, and changes as it's let go. The drag is made once its element is in the
 * page and given new props with `set()`, never made again for them; a new element, handle or scroll
 * area, or another axis, makes it again where it was.
 */
import {
  defineComponent,
  inject,
  nextTick,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
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
import { attachRef, batched, renderPart, useControllable, watchSettings, type FunctionRef } from "./helpers";
import {
  createDrag,
  type Drag as DragEngine,
  type DragAxis,
  type DragBounds,
  type DragMove,
  type DragPoint,
  type DragSettings,
  type DragSnaps,
  type SpringParams,
} from "@fluidkit/core";

/** The room it moves in, as snap points and bounds are given it: its parent's inner size, and itself */
export type DragArea = { width: number; height: number; element: HTMLElement };

/** As it is, or a function of the room it moves in */
type Given<T> = T | ((area: DragArea) => T);

export type UseDragOptions = Omit<DragSettings, "snaps" | "bounds"> & {
  /** Along `x`, `y`, or `both` (the default) */
  axis?: DragAxis;
  /** Where it may come to rest; a function of the room it's in is read again on a resize */
  snaps?: Given<DragSnaps>;
  /** How far it moves before it's rubber; the farthest snap points unless given */
  bounds?: Given<DragBounds>;
  /** The snap point it's at, from the parent. Without it, it's its own */
  snap?: number;
  /** The snap point it starts at, when it's its own; the first unless given */
  defaultSnap?: number;
  /** Let go heading for another snap point, or sent to one */
  onSnapChange?: (snap: number) => void;
  /** Not dragged while true; a drag under way is let go */
  disabled?: boolean;
};

export type UseDrag = {
  /** The ref for what moves: `:ref="drag.element"` */
  element: FunctionRef;
  /** The ref for what's grabbed, such as a sheet's grabber; the element itself without one */
  handle: FunctionRef;
  /** The ref for an area inside that scrolls, such as a sheet's list: one gesture between the two */
  scroll: FunctionRef;
  /** The snap point it's at or heads for */
  snap: Readonly<ComputedRef<number>>;
  /** A pointer is dragging it */
  dragging: Readonly<Ref<boolean>>;
  /** To a snap point */
  snapTo(index: number, move?: DragMove): void;
  /** To an offset within its bounds: a number along the axis, or a point */
  to(position: number | DragPoint, move?: DragMove): void;
  /** The engine, once its element is in the page */
  drag: Readonly<ShallowRef<DragEngine | null>>;
};

type Els = { element: HTMLElement | null; handle: HTMLElement | null; scroll: HTMLElement | null };

/** Settings as the engine takes them: the composable's own options and the callbacks left out */
const settingsOf = ({
  axis: _a,
  snap: _s,
  defaultSnap: _d,
  onSnapChange: _c,
  disabled: _x,
  onStart: _os,
  onMove: _om,
  onEnd: _oe,
  onRest: _or,
  ...settings
}: UseDragOptions) => settings;

/**
 * A drag on elements of yours: give its refs to them. Options can be a ref or a getter, read again
 * as they change
 */
export function useDrag(options: MaybeRefOrGetter<UseDragOptions> = {}): UseDrag {
  const latest = () => toValue(options);
  const snap = useControllable(
    () => latest().snap,
    latest().defaultSnap ?? 0,
    (index) => latest().onSnapChange?.(index),
  );
  const dragging = shallowRef(false);
  const els: Els = { element: null, handle: null, scroll: null };
  let made: ({ drag: DragEngine; axis: DragAxis } & Els) | null = null;
  const taken: { current: DragSettings | null } = { current: null };
  const drag = shallowRef<DragEngine | null>(null);
  let disposed = false;

  /** The room it moves in now */
  const area = (): DragArea => {
    const element = els.element!;
    const parent = element.parentElement;
    return { width: parent?.clientWidth ?? 0, height: parent?.clientHeight ?? 0, element };
  };
  /**
   * A function of the room, as the engine reads it: the same function for as long as one is given,
   * so a new one each render doesn't count as new snap points. What it gave last is kept, to tell
   */
  const last = { snaps: "", bounds: "" };
  const given = (key: "snaps" | "bounds") => {
    const value = latest()[key];
    const result = typeof value === "function" ? value(area()) : value;
    last[key] = JSON.stringify(result);
    return result;
  };
  const read = { snaps: () => given("snaps") as DragSnaps, bounds: () => given("bounds") as DragBounds };
  const engineSide = (o: UseDragOptions): DragSettings => ({
    ...settingsOf(o),
    snaps: typeof o.snaps === "function" ? read.snaps : o.snaps,
    bounds: typeof o.bounds === "function" ? read.bounds : o.bounds,
  });

  const letGo = () => {
    made?.drag.destroy();
    made = null;
    drag.value = null;
  };

  /** Made, made again or let go, as its elements came and went in the last render */
  const sync = batched(() => {
    if (disposed) return;
    const { element, handle, scroll } = els;
    const axis = latest().axis ?? "both";
    let from = snap.value.value;
    if (made) {
      const m = made;
      if (m.element === element && m.handle === handle && m.scroll === scroll && m.axis === axis) return;
      // Made again where it was
      from = m.drag.current ?? from;
      letGo();
    }
    if (!element) return;
    const settings = engineSide(latest());
    const engine = createDrag({
      ...settings,
      element,
      handle: handle ?? undefined,
      scroll: scroll ?? undefined,
      axis,
      initial: from,
      // Always the latest options', so new callbacks never make it again
      onStart: () => {
        dragging.value = true;
        latest().onStart?.();
      },
      onMove: (position, velocity) => latest().onMove?.(position, velocity),
      onEnd: (index) => {
        dragging.value = false;
        if (index !== null && index !== snap.value.value) {
          snap.set(index);
          // A parent that kept `snap` as it was sends it back, once it's had its say
          void nextTick(() => {
            const engine_ = made?.drag;
            if (engine_ && engine_.current !== snap.value.value) engine_.snap(snap.value.value);
          });
        }
        latest().onEnd?.(index);
      },
      onRest: () => latest().onRest?.(),
    });
    engine.disabled = !!latest().disabled;
    taken.current = settings;
    made = { drag: engine, axis, element, handle, scroll };
    drag.value = engine;
  });

  const bind = (key: keyof Els) =>
    attachRef((el) => {
      els[key] = el;
      sync();
      return () => {
        if (els[key] === el) els[key] = null;
        // Its element going: let go now, its own `translate` back before Vue takes it out
        if (key === "element" && made?.element === el) letGo();
        sync();
      };
    });

  watchSettings(drag, () => engineSide(latest()), taken);

  watchPostEffect(() => {
    const engine = drag.value;
    const o = latest();
    if (!engine) return;
    // Another axis: made again
    if (made && made.axis !== (o.axis ?? "both")) {
      sync();
      return;
    }
    engine.disabled = !!o.disabled;
    // Snap points or bounds of the room that come out otherwise now: followed
    for (const key of ["snaps", "bounds"] as const) {
      const fn = o[key];
      if (typeof fn === "function" && JSON.stringify(fn(area())) !== last[key]) {
        engine.update();
        break;
      }
    }
  });

  // At the snap point it's asked to be at, as that changes
  watch(
    [drag, snap.value],
    ([engine, index]) => {
      if (engine && engine.current !== index) engine.snap(index);
    },
    { flush: "post" },
  );

  onScopeDispose(() => {
    disposed = true;
    letGo();
  });

  return {
    element: bind("element"),
    handle: bind("handle"),
    scroll: bind("scroll"),
    snap: snap.value,
    dragging,
    snapTo: (index, move) => {
      made?.drag.snap(index, move);
      snap.set(index);
    },
    to: (position, move) => made?.drag.to(position, move),
    drag,
  };
}

// ── Components ──

const DragKey: InjectionKey<UseDrag> = Symbol("fluidkit-drag");

function useDragContext(part: string) {
  const context = inject(DragKey, null);
  if (!context) throw new Error(`Drag.${part} has to be inside <Drag.Root>`);
  return context;
}

const asChild = { type: Boolean, default: false } as const;

/** What a part's slot gets */
export type DragState = { snap: number; dragging: boolean };

/**
 * What moves, laid out where it rests at offset 0: a `div`, or with `as-child` the element in its
 * slot. Marked `data-snap` with the snap point it's at or heads for, and `data-dragging` while a
 * pointer drags it
 */
const Root = defineComponent({
  name: "DragRoot",
  inheritAttrs: false,
  props: {
    /** Along `x`, `y`, or `both` (the default) */
    axis: String as PropType<DragAxis>,
    /** Where it may come to rest; a function of the room it's in is read again on a resize */
    snaps: [Array, Function] as PropType<Given<DragSnaps>>,
    /** How far it moves before it's rubber; the farthest snap points unless given */
    bounds: [Object, Function] as PropType<Given<DragBounds>>,
    /** The snap point it's at: controlled, with `v-model:snap`. Without it, it's its own */
    snap: { type: Number, default: undefined },
    /** The snap point it starts at, when it's its own */
    defaultSnap: Number,
    /** Not dragged while true */
    disabled: Boolean,
    /** How hard it pulls back past its bounds: 0.55 unless given */
    rubberband: Number,
    /** How quickly a flick would slow down, per millisecond: 0.998 unless given */
    deceleration: Number,
    /** The spring it settles on */
    spring: Object as PropType<SpringParams>,
    /** A spring it chases the pointer on while dragged */
    follow: Object as PropType<SpringParams>,
    asChild,
  },
  emits: {
    /** Let go heading for another snap point */
    "update:snap": (_snap: number) => true,
    /** A pointer starts dragging it, or catches it on its way */
    start: () => true,
    /** Every frame it moves: its offset and speed, px/s */
    move: (_position: DragPoint, _velocity: DragPoint) => true,
    /** Let go, heading for this snap point (`null` with none) */
    end: (_snap: number | null) => true,
    /** It has come to rest */
    rest: () => true,
  },
  slots: Object as SlotsType<{ default: DragState }>,
  setup(props, { attrs, slots, emit }) {
    const drag = useDrag(() => ({
      axis: props.axis,
      snaps: props.snaps,
      bounds: props.bounds,
      snap: props.snap,
      defaultSnap: props.defaultSnap,
      disabled: props.disabled,
      rubberband: props.rubberband,
      deceleration: props.deceleration,
      spring: props.spring,
      follow: props.follow,
      onSnapChange: (snap) => emit("update:snap", snap),
      onStart: () => emit("start"),
      onMove: (position, velocity) => emit("move", position, velocity),
      onEnd: (snap) => emit("end", snap),
      onRest: () => emit("rest"),
    }));
    provide(DragKey, drag);
    return () =>
      renderPart("div", { ...attrs, ref: drag.element, "data-snap": drag.snap.value }, props.asChild, slots, {
        snap: drag.snap.value,
        dragging: drag.dragging.value,
      });
  },
});

/** What's grabbed, such as a sheet's grabber: a `div`. Without one, the root is */
const Handle = defineComponent({
  name: "DragHandle",
  inheritAttrs: false,
  props: { asChild },
  slots: Object as SlotsType<{ default: DragState }>,
  setup(props, { attrs, slots }) {
    const drag = useDragContext("Handle");
    return () =>
      renderPart("div", { ...attrs, ref: drag.handle }, props.asChild, slots, {
        snap: drag.snap.value,
        dragging: drag.dragging.value,
      });
  },
});

/**
 * An area inside that scrolls along its axis, such as a sheet's list: a finger hands one gesture
 * between the two, as iOS sheets do. A `div`, or with `as-child` the element in its slot
 */
const Scroll = defineComponent({
  name: "DragScroll",
  inheritAttrs: false,
  props: { asChild },
  slots: Object as SlotsType<{ default: DragState }>,
  setup(props, { attrs, slots }) {
    const drag = useDragContext("Scroll");
    return () =>
      renderPart("div", { ...attrs, ref: drag.scroll }, props.asChild, slots, {
        snap: drag.snap.value,
        dragging: drag.dragging.value,
      });
  },
});

/** The drag's state and refs inside `<Drag.Root>`: for a part of your own */
export function useDragParts() {
  return useDragContext("parts");
}

/** Drag's parts: `Root`, `Handle`, `Scroll` */
export const Drag = { Root, Handle, Scroll };

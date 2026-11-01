/**
 * Drag for React: `<Drag.Root>` and its parts by default, `useDrag()` for markup of your own.
 *
 *   <Drag.Root axis="y" snaps={({ height }) => [0, height / 2, height - 76]} snap={snap} onSnapChange={setSnap}>
 *     <Drag.Handle className="grabber" />
 *     <Drag.Scroll render={<ul />}>{rows}</Drag.Scroll>
 *   </Drag.Root>
 *
 * The root is what moves. Snap points and bounds can be functions of the room it's in (its parent's
 * size): read again on a resize, and after a render that changes them. `snap` is the snap point it's
 * at or heads for, and changes as it's let go. The drag is made once its element is in the page and
 * given new props with `set()`, never made again for them; a new element, handle or scroll area, or
 * another axis, makes it again where it was.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefCallback,
} from "react";
import {
  useMergedRefs,
  renderPart,
  useAttach,
  useBatched,
  useControllable,
  useIsomorphicLayoutEffect,
  useLatest,
  useSettings,
  type RenderProp,
} from "./helpers";
import {
  createDrag,
  type Drag as DragEngine,
  type DragAxis,
  type DragBounds,
  type DragMove,
  type DragPoint,
  type DragSettings,
  type DragSnaps,
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
  /** The ref for what moves */
  element: RefCallback<HTMLElement>;
  /** The ref for what's grabbed, such as a sheet's grabber; the element itself without one */
  handle: RefCallback<HTMLElement>;
  /** The ref for an area inside that scrolls, such as a sheet's list: one gesture between the two */
  scroll: RefCallback<HTMLElement>;
  /** The snap point it's at or heads for */
  snap: number;
  /** A pointer is dragging it */
  dragging: boolean;
  /** To a snap point */
  snapTo(index: number, move?: DragMove): void;
  /** To an offset within its bounds: a number along the axis, or a point */
  to(position: number | DragPoint, move?: DragMove): void;
  /** The engine, once its element is in the page: for what the hook doesn't give */
  drag: DragEngine | null;
};

type Els = { element: HTMLElement | null; handle: HTMLElement | null; scroll: HTMLElement | null };

/** Settings as the engine takes them: the hook's own options and the callbacks left out */
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

/** A drag on elements of yours: give its refs to them */
export function useDrag(options: UseDragOptions = {}): UseDrag {
  const latest = useLatest(options);
  const [snap, choose] = useControllable(options.snap, options.defaultSnap ?? 0, (index) =>
    latest.current.onSnapChange?.(index),
  );
  const at = useLatest(snap);
  const [dragging, setDragging] = useState(false);
  /** Let go: a render to check it against `snap`, which the parent may have kept as it was */
  const [letGoes, bump] = useReducer((n: number) => n + 1, 0);
  const els = useRef<Els>({ element: null, handle: null, scroll: null });
  const made = useRef<({ drag: DragEngine; axis: DragAxis } & Els) | null>(null);
  const taken = useRef<DragSettings | null>(null);
  const [drag, setDrag] = useState<DragEngine | null>(null);

  /** The room it moves in now */
  const area = (): DragArea => {
    const element = els.current.element!;
    const parent = element.parentElement;
    return { width: parent?.clientWidth ?? 0, height: parent?.clientHeight ?? 0, element };
  };
  /**
   * A function of the room, as the engine reads it: the same function for as long as one is given,
   * so a new one each render doesn't count as new snap points. What it gave last is kept, to tell
   */
  const read = useRef({
    snaps: { last: "", fn: () => given("snaps") as DragSnaps },
    bounds: { last: "", fn: () => given("bounds") as DragBounds },
  });
  const given = (key: "snaps" | "bounds") => {
    const value = latest.current[key];
    const result = typeof value === "function" ? value(area()) : value;
    read.current[key].last = JSON.stringify(result);
    return result;
  };
  const engineSide = (o: UseDragOptions): DragSettings => {
    const settings = settingsOf(o);
    return {
      ...settings,
      snaps: typeof o.snaps === "function" ? read.current.snaps.fn : o.snaps,
      bounds: typeof o.bounds === "function" ? read.current.bounds.fn : o.bounds,
    };
  };

  const letGo = () => {
    made.current?.drag.destroy();
    made.current = null;
    setDrag(null);
  };

  /** Made, made again or let go, as its elements came and went in the last commit */
  const sync = useBatched(() => {
    const { element, handle, scroll } = els.current;
    const axis = latest.current.axis ?? "both";
    let from = at.current;
    if (made.current) {
      const m = made.current;
      if (m.element === element && m.handle === handle && m.scroll === scroll && m.axis === axis) return;
      // Made again where it was
      from = m.drag.current ?? from;
      letGo();
    }
    if (!element) return;
    const settings = engineSide(latest.current);
    const engine = createDrag({
      ...settings,
      element,
      handle: handle ?? undefined,
      scroll: scroll ?? undefined,
      axis,
      initial: from,
      // Always the latest props', so new callbacks never make it again
      onStart: () => {
        setDragging(true);
        latest.current.onStart?.();
      },
      onMove: (position, velocity) => latest.current.onMove?.(position, velocity),
      onEnd: (index) => {
        setDragging(false);
        if (index !== null && index !== at.current) {
          choose(index);
          bump();
        }
        latest.current.onEnd?.(index);
      },
      onRest: () => latest.current.onRest?.(),
    });
    engine.disabled = !!latest.current.disabled;
    taken.current = settings;
    made.current = { drag: engine, axis, element, handle, scroll };
    setDrag(engine);
  });

  const bind = (key: keyof Els) => (el: HTMLElement) => {
    els.current[key] = el;
    sync();
    return () => {
      if (els.current[key] === el) els.current[key] = null;
      // Its element going: let go now, its own `translate` back before React takes it out
      if (key === "element" && made.current?.element === el) letGo();
      sync();
    };
  };
  const element = useAttach(bind("element"));
  const handle = useAttach(bind("handle"));
  const scroll = useAttach(bind("scroll"));

  useSettings(drag, engineSide(options), taken);

  useIsomorphicLayoutEffect(() => {
    if (!drag) return;
    // Another axis: made again
    if (made.current && made.current.axis !== (options.axis ?? "both")) {
      sync();
      return;
    }
    drag.disabled = !!options.disabled;
    // Snap points or bounds of the room that came out otherwise this render: followed
    for (const key of ["snaps", "bounds"] as const) {
      const fn = options[key];
      if (typeof fn !== "function") continue;
      if (JSON.stringify(fn(area())) !== read.current[key].last) {
        drag.update();
        break;
      }
    }
  });

  // At the snap point it's asked to be at, as that changes, or as it's let go elsewhere: a parent
  // that kept `snap` as it was sends it back
  useIsomorphicLayoutEffect(() => {
    if (drag && drag.current !== snap) drag.snap(snap);
  }, [drag, snap, letGoes]);

  const snapTo = useCallback(
    (index: number, move?: DragMove) => {
      made.current?.drag.snap(index, move);
      choose(index);
    },
    [choose],
  );
  const to = useCallback((position: number | DragPoint, move?: DragMove) => made.current?.drag.to(position, move), []);

  return useMemo(
    () => ({ element, handle, scroll, snap, dragging, snapTo, to, drag }),
    [element, handle, scroll, snap, dragging, snapTo, to, drag],
  );
}

// ── Components ──

const Context = createContext<UseDrag | null>(null);

function useDragContext(part: string) {
  const context = useContext(Context);
  if (!context) throw new Error(`Drag.${part} has to be inside <Drag.Root>`);
  return context;
}

type PartProps<State> = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Render as an element of yours, or a function of the props and state; a `div` unless given */
  render?: RenderProp<State>;
  children?: ReactNode;
};

/** What a part's `render` gets as its state */
export type DragState = { snap: number; dragging: boolean };

export type DragRootProps = UseDragOptions & PartProps<DragState>;

/**
 * What moves, laid out where it rests at offset 0: a `div` unless rendered as something else. Marked
 * `data-snap` with the snap point it's at or heads for, and `data-dragging` while a pointer drags it
 */
const Root = forwardRef<HTMLElement, DragRootProps>(function DragRoot(props, ref) {
  const {
    axis,
    snaps,
    bounds,
    snap,
    defaultSnap,
    onSnapChange,
    disabled,
    rubberband,
    deceleration,
    spring,
    follow,
    onStart,
    onMove,
    onEnd,
    onRest,
    render,
    ...rest
  } = props;
  const drag = useDrag({
    axis,
    snaps,
    bounds,
    snap,
    defaultSnap,
    onSnapChange,
    disabled,
    rubberband,
    deceleration,
    spring,
    follow,
    onStart,
    onMove,
    onEnd,
    onRest,
  });
  const merged = useMergedRefs(drag.element, ref);
  return (
    <Context.Provider value={drag}>
      {renderPart("div", { ...rest, ref: merged, "data-snap": drag.snap }, render, {
        snap: drag.snap,
        dragging: drag.dragging,
      })}
    </Context.Provider>
  );
});

/** What's grabbed, such as a sheet's grabber: a `div` unless rendered as something else. Without one, the root is */
const Handle = forwardRef<HTMLElement, PartProps<DragState>>(function DragHandle({ render, ...props }, ref) {
  const drag = useDragContext("Handle");
  const merged = useMergedRefs(drag.handle, ref);
  return renderPart("div", { ...props, ref: merged }, render, { snap: drag.snap, dragging: drag.dragging });
});

/**
 * An area inside that scrolls along its axis, such as a sheet's list: a finger hands one gesture
 * between the two, as iOS sheets do. A `div` unless rendered as something else
 */
const Scroll = forwardRef<HTMLElement, PartProps<DragState>>(function DragScroll({ render, ...props }, ref) {
  const drag = useDragContext("Scroll");
  const merged = useMergedRefs(drag.scroll, ref);
  return renderPart("div", { ...props, ref: merged }, render, { snap: drag.snap, dragging: drag.dragging });
});

/** The drag's state and refs inside `<Drag.Root>`: for a part of your own */
export function useDragParts() {
  return useDragContext("parts");
}

/** Drag's parts: `Root`, `Handle`, `Scroll` */
export const Drag = { Root, Handle, Scroll };

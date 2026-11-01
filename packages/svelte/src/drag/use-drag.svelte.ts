import { tick, untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { elementRef, syncSettings, type ElementRef } from "../helpers/index.js";
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
export type Given<T> = T | ((area: DragArea) => T);

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
  /** For what moves: `{@attach drag.element}` */
  element: Attachment;
  /** For what's grabbed, such as a sheet's grabber; the element itself without one */
  handle: Attachment;
  /** For an area inside that scrolls, such as a sheet's list: one gesture between the two */
  scroll: Attachment;
  /** The snap point it's at or heads for */
  readonly snap: number;
  /** A pointer is dragging it */
  readonly dragging: boolean;
  /** To a snap point */
  snapTo(index: number, move?: DragMove): void;
  /** To an offset within its bounds: a number along the axis, or a point */
  to(position: number | DragPoint, move?: DragMove): void;
  /** The engine, once its element is in the page */
  readonly drag: DragEngine | null;
};

/** Settings as the engine takes them: the function's own options and the callbacks left out */
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
 * A drag on elements of yours: attach its attachments to them. Options are a getter, read again as
 * what it reads changes. In a component's script
 *
 *   const sheet = useDrag(() => ({ axis: "y", snaps: ({ height }) => [0, height / 2] }));
 *   <div {@attach sheet.element} class="sheet">
 *     <div {@attach sheet.handle} class="grabber"></div>
 *   </div>
 */
export function useDrag(options: () => UseDragOptions = () => ({})): UseDrag {
  // The snap point: the parent's when it gives one, its own otherwise
  let own = $state(untrack(() => options().defaultSnap ?? 0));
  const snap = $derived(options().snap ?? own);
  const setSnap = (index: number) => {
    const now = untrack(options);
    if (now.snap === undefined) own = index;
    now.onSnapChange?.(index);
  };
  let dragging = $state(false);
  const element = elementRef();
  const handle = elementRef();
  const scroll = elementRef();
  let drag = $state.raw<DragEngine | null>(null);
  const taken: { current: DragSettings | null } = { current: null };
  /** Where the last one was, for one made again there */
  let at: number | null = null;
  /** The element the engine was made on */
  let madeOn: Element | null = null;

  /** The room it moves in now */
  const area = (): DragArea => {
    const el = element.current!;
    const parent = el.parentElement;
    return { width: parent?.clientWidth ?? 0, height: parent?.clientHeight ?? 0, element: el };
  };
  /**
   * A function of the room, as the engine reads it: the same function for as long as one is given,
   * so a new one each update doesn't count as new snap points. What it gave last is kept, to tell
   */
  const last = { snaps: "", bounds: "" };
  const given = (key: "snaps" | "bounds") => {
    const value = untrack(options)[key];
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

  // Made once its element is in the page, and again for another element, handle, scroll area or
  // axis, where it was. Only those make it again: the rest is handed over as it changes
  const axis = $derived(options().axis ?? "both");
  $effect(() => {
    const el = element.current;
    const grab = handle.current;
    const list = scroll.current;
    const along = axis;
    if (!el) return;
    const engine = untrack(() => {
      const now = options();
      const settings = engineSide(now);
      const created = createDrag({
        ...settings,
        element: el,
        handle: grab ?? undefined,
        scroll: list ?? undefined,
        axis: along,
        initial: at ?? snap,
        // Always the latest options', so new callbacks never make it again
        onStart: () => {
          dragging = true;
          options().onStart?.();
        },
        onMove: (position, velocity) => options().onMove?.(position, velocity),
        onEnd: (index) => {
          dragging = false;
          if (index !== null && index !== snap) {
            setSnap(index);
            // A parent that kept `snap` as it was sends it back, once it's had its say
            void tick().then(() => {
              if (drag === created && created.current !== snap) created.snap(snap);
            });
          }
          options().onEnd?.(index);
        },
        onRest: () => options().onRest?.(),
      });
      created.disabled = !!now.disabled;
      taken.current = settings;
      return created;
    });
    at = null;
    madeOn = el;
    drag = engine;
    return () => {
      at = engine.current;
      engine.destroy();
      if (drag === engine) drag = null;
    };
  });

  syncSettings(
    () => drag,
    () => engineSide(options()),
    taken,
  );

  // Disabled as asked; and snap points or bounds of the room that come out otherwise now, followed.
  // The functions are called here, so what they read is followed too
  $effect(() => {
    const engine = drag;
    const o = options();
    if (!engine) return;
    const now = (["snaps", "bounds"] as const).map((key) => {
      const fn = o[key];
      return typeof fn === "function" ? JSON.stringify(fn(area())) : null;
    });
    untrack(() => {
      engine.disabled = !!o.disabled;
      if (now[0] !== null && now[0] !== last.snaps) engine.update();
      else if (now[1] !== null && now[1] !== last.bounds) engine.update();
    });
  });

  // At the snap point it's asked to be at, as that changes
  $effect(() => {
    const engine = drag;
    const index = snap;
    if (engine && untrack(() => engine.current) !== index) untrack(() => engine.snap(index));
  });

  /** Its element going: let go now, its own `translate` given back before Svelte takes it out */
  const attachElement: Attachment = (node) => {
    const off = element.attach(node);
    return () => {
      off();
      if (drag && madeOn === node) {
        drag.destroy();
        drag = null;
      }
    };
  };
  const attach = (ref: ElementRef): Attachment => ref.attach;

  return {
    element: attachElement,
    handle: attach(handle),
    scroll: attach(scroll),
    get snap() {
      return snap;
    },
    get dragging() {
      return dragging;
    },
    snapTo: (index, move) => {
      drag?.snap(index, move);
      setSnap(index);
    },
    to: (position, move) => drag?.to(position, move),
    get drag() {
      return drag;
    },
  };
}

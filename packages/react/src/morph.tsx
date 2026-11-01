/**
 * Morph for React: `<Morph.Root>` and its parts by default, `useMorph()` for markup of your own.
 *
 *   <Morph.Root value={open ? "panel" : "button"} onValueChange={(v) => setOpen(v === "panel")}>
 *     <Morph.State value="button" render={<Morph.Trigger value="panel" className="lb" />}>
 *       More
 *     </Morph.State>
 *     <Morph.State value="panel" className="lb panel">
 *       <Morph.Trigger value="button">Close</Morph.Trigger>
 *     </Morph.State>
 *   </Morph.Root>
 *
 * States are known by their `value`. `value` is the one asked for, as the engine's `current`: it
 * changes at once, and the shape flows there. The morph is made once a state is in the page and
 * given new props with `set()`, never made again for them; a state that comes later is added to it,
 * one that goes is let go of. The one it's at going makes it again, from the others.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from "react";
import {
  flag,
  useMergedRefs,
  renderPart,
  useBatched,
  useIsomorphicLayoutEffect,
  useLatest,
  useSettings,
  type RenderProp,
} from "./helpers";
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
  container?: HTMLElement | RefObject<HTMLElement | null> | null;
  /** A flight set off, turning around or heading elsewhere included */
  onStart?: (to: V, from: V) => void;
  /** It came to rest as a state */
  onRest?: (at: V) => void;
  /** Every frame of a flight: how far along it is toward `to`, 0 to 1. `from` is `null` when it started over mid-way */
  onProgress?: (progress: number, to: V, from: V | null) => void;
};

export type UseMorph<V extends string = string> = {
  /** The ref for a state, known by its value */
  state(value: V): RefCallback<HTMLElement>;
  /** The state asked for; `null` until one is in the page, when it's its own */
  value: V | null;
  /** A flight is under way */
  moving: boolean;
  /** Flows into a state. Resolves when it comes to rest: `true` there, `false` if it was sent elsewhere first */
  to(value: V, move?: MorphMove): Promise<boolean>;
  /** The engine, once a state is in the page: for what the hook doesn't give */
  morph: MorphEngine | null;
};

/** An element, or one a ref holds */
const resolve = (given: UseMorphOptions["container"]) =>
  given && "current" in given ? given.current : (given ?? null);

/** A morph on elements of yours: give each state its ref, with its value */
export function useMorph<V extends string = string>(options: UseMorphOptions<V> = {}): UseMorph<V> {
  const latest = useLatest(options);
  const [own, setOwn] = useState<V | null>(options.defaultValue ?? null);
  const controlled = options.value !== undefined;
  const value = controlled ? (options.value as V) : own;
  const asked = useLatest(value);
  const [moving, setMoving] = useState(false);
  /** The states, both ways, in the order they came */
  const states = useRef({ byValue: new Map<V, HTMLElement>(), byElement: new Map<HTMLElement, V>() });
  const made = useRef<{ morph: MorphEngine; container: HTMLElement | null } | null>(null);
  const taken = useRef<Pick<MorphSettings, "spring"> | null>(null);
  const [morph, setMorph] = useState<MorphEngine | null>(null);
  /** Asked for by `to()`, before the value was rendered: resolved once it's flown */
  const waiting = useRef<{ value: V; move?: MorphMove; resolve: (rested: boolean) => void }[]>([]);

  const valueOf = (el: HTMLElement) => states.current.byElement.get(el) as V;
  const letGo = () => {
    made.current?.morph.destroy();
    made.current = null;
    setMorph(null);
  };

  /** Made, made again or let go, as its states and container came and went in the last commit */
  const sync = useBatched(() => {
    const container = resolve(latest.current.container);
    if (made.current && made.current.container !== container) letGo();
    const { byValue } = states.current;
    if (made.current || !byValue.size) return;
    const initial = (asked.current !== null && byValue.get(asked.current)) || byValue.values().next().value!;
    const spring = latest.current.spring;
    const engine = createMorph({
      states: [...byValue.values()],
      initial,
      container: container ?? undefined,
      spring,
      // Always the latest props', so new callbacks never make it again
      onStart: (to, from) => {
        setMoving(true);
        latest.current.onStart?.(valueOf(to), valueOf(from));
      },
      onRest: (at) => {
        setMoving(false);
        latest.current.onRest?.(valueOf(at));
      },
      onProgress: (progress, to, from) => latest.current.onProgress?.(progress, valueOf(to), from && valueOf(from)),
    });
    taken.current = { spring };
    made.current = { morph: engine, container };
    setMorph(engine);
    // Nothing said where it starts: where it's made is its value now
    if (asked.current === null) setOwn(valueOf(initial));
  });

  // One stable ref per value, so React doesn't let a state go and take it again each render
  const refs = useRef(new Map<V, RefCallback<HTMLElement>>());
  const state = useCallback(
    (v: V) => {
      let ref = refs.current.get(v);
      if (!ref) {
        let cleanup: (() => void) | null = null;
        ref = (el: HTMLElement | null) => {
          cleanup?.();
          cleanup = null;
          if (!el) return;
          const { byValue, byElement } = states.current;
          byValue.set(v, el);
          byElement.set(el, v);
          if (made.current) made.current.morph.add(el);
          else sync();
          // React lets refs go before it takes elements out: the state's own styles are back by then.
          // The one it's at can't be let go of: the morph is made again, from the others
          cleanup = () => {
            if (byValue.get(v) === el) byValue.delete(v);
            const engine = made.current?.morph;
            if (engine?.current === el) {
              letGo();
              sync();
            } else engine?.remove(el);
            byElement.delete(el);
          };
        };
        refs.current.set(v, ref);
      }
      return ref;
    },
    [sync],
  );

  useSettings(morph, { spring: options.spring }, taken);

  // A container of another element: made again there
  useIsomorphicLayoutEffect(() => {
    if (made.current && made.current.container !== resolve(options.container)) sync();
  });

  // Where it's asked to be, as that changes; what was waiting for it hears how it went
  useIsomorphicLayoutEffect(() => {
    if (!morph || value === null) return;
    const el = states.current.byValue.get(value);
    if (!el) return;
    const waiters = waiting.current;
    waiting.current = [];
    const flown = morph.to(el, waiters.find((w) => w.value === value)?.move);
    for (const w of waiters) {
      if (w.value === value) void flown.then(w.resolve);
      else w.resolve(false);
    }
  }, [morph, value]);

  // It flies once the value asked for is rendered: what the same handler changed (a label, a
  // match) is in the page by then, as the flight reads it
  const to = useCallback(
    (v: V, move?: MorphMove): Promise<boolean> => {
      const engine = made.current?.morph;
      const el = states.current.byValue.get(v);
      if (!engine || !el) return Promise.resolve(false);
      // Asked for already: no render to wait for
      if (asked.current === v) return engine.to(el, move);
      latest.current.onValueChange?.(v);
      if (latest.current.value === undefined) setOwn(v);
      return new Promise((resolve) => waiting.current.push({ value: v, move, resolve }));
    },
    [asked, latest],
  );

  return useMemo(() => ({ state, value, moving, to, morph }), [state, value, moving, to, morph]);
}

// ── Components ──

const Context = createContext<UseMorph | null>(null);

function useMorphContext(part: string) {
  const context = useContext(Context);
  if (!context) throw new Error(`Morph.${part} has to be inside <Morph.Root>`);
  return context;
}

export type MorphRootProps<V extends string = string> = UseMorphOptions<V> & { children?: ReactNode };

/** The morph: its options and state, for the states and triggers inside it. Renders nothing of its own */
function Root({ children, ...options }: MorphRootProps) {
  const morph = useMorph(options);
  return <Context.Provider value={morph}>{children}</Context.Provider>;
}

type PartProps<State> = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Render as an element of yours, or a function of the props and state */
  render?: RenderProp<State>;
  children?: ReactNode;
};

/** What a state's `render` gets as its state */
export type MorphStateState = { current: boolean; moving: boolean };

export type MorphStateProps = PartProps<MorphStateState> & {
  /** What it's known by: what `value` and `onValueChange` say */
  value: string;
};

/**
 * A state: laid out where and as it is at rest, a `div` unless rendered as something else. Marked
 * `data-current` while it's the one asked for. Keep its hiding (`visibility: hidden`) in CSS, not
 * in `style`: away, a state's inline opacity and visibility are the morph's
 */
const State = forwardRef<HTMLElement, MorphStateProps>(function MorphState({ render, value, ...props }, ref) {
  const morph = useMorphContext("State");
  const current = morph.value === value;
  const merged = useMergedRefs(morph.state(value), ref);
  return renderPart("div", { ...props, ref: merged, "data-current": flag(current) }, render, {
    current,
    moving: morph.moving,
  });
});

export type MorphTriggerProps = PartProps<{ current: boolean }> & {
  /** The state it sends the morph to */
  value: string;
  /** There at once, as with reduced motion */
  instant?: boolean;
};

/**
 * Sends the morph to a state when it's clicked: a `button` unless rendered as something else. A
 * state can be one, rendered as a trigger to another (`render={<Morph.Trigger value="panel" />}`)
 */
const Trigger = forwardRef<HTMLElement, MorphTriggerProps>(function MorphTrigger(
  { render, value, instant, onClick, ...props },
  ref,
) {
  const morph = useMorphContext("Trigger");
  const current = morph.value === value;
  return renderPart(
    "button",
    {
      type: "button",
      ...props,
      ref,
      onClick: (event: MouseEvent<HTMLElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) void morph.to(value, instant ? { instant } : undefined);
      },
    },
    render,
    { current },
  );
});

export type MorphMatchProps = PartProps<Record<string, never>> & {
  /** Flies to the match of the same name in the other state; none without one */
  name?: string;
};

/** A piece that flies from one state into the other, to its match of the same `name`: a `span` unless rendered as something else */
const Match = forwardRef<HTMLElement, MorphMatchProps>(function MorphMatch({ render, name, ...props }, ref) {
  return renderPart("span", { ...props, ref, "data-fk-match": name }, render, {});
});

/** The morph's state and refs inside `<Morph.Root>`: for a part of your own */
export function useMorphParts() {
  return useMorphContext("parts");
}

/** Morph's parts: `Root`, `State`, `Trigger`, `Match` */
export const Morph = { Root, State, Trigger, Match };

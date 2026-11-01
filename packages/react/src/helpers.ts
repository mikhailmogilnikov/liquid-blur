/**
 * What Fluid Kit's React components are made of: their `render` prop, the props and refs they
 * merge, refs that bind an engine to an element, controlled state, and settings kept in step. For
 * its own components; a component of your own can use them too.
 */
import {
  cloneElement,
  createElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type Ref,
  type RefCallback,
} from "react";
import { changed } from "@fluidkit/core/internal";

/** A layout effect in the browser, an effect on the server (where neither runs, and React says so) */
export const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/** The value as of the last render, for callbacks that outlive it: never stale, never a new identity */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * A value that's the parent's when it gives one (`value`), the component's own otherwise, starting
 * at `defaultValue`; either way, `onChange` hears of every change asked for
 */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (value: T) => void) {
  const [own, setOwn] = useState(defaultValue);
  const controlled = value !== undefined;
  const latest = useLatest(onChange);
  const set = useCallback(
    (next: T) => {
      if (!controlled) setOwn(next);
      latest.current?.(next);
    },
    [controlled, latest],
  );
  return [controlled ? value : own, set] as const;
}

/**
 * A ref that binds something to an element: `attach` runs when the element comes, its cleanup when
 * it goes or another comes. Stable, so React never detaches and attaches it again for a new render;
 * the same in React 18 (a ref called with `null`) and 19.
 */
export function useAttach<E extends Element>(attach: (el: E) => void | (() => void)): RefCallback<E> {
  const latest = useLatest(attach);
  const cleanup = useRef<void | (() => void)>(undefined);
  return useCallback(
    (el: E | null) => {
      cleanup.current?.();
      cleanup.current = el ? latest.current(el) : undefined;
    },
    [latest],
  );
}

/** One ref from several: each gets the element */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref) (ref as { current: T | null }).current = value;
    }
  };
}

/**
 * One stable ref from several, the same function as long as they are: React lets a ref go and takes
 * it again whenever it's a new function, and an engine bound to it would take that for its element
 * going
 */
export function useMergedRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the refs themselves are the dependencies
  return useMemo(() => mergeRefs(...refs), refs);
}

type Props = Record<string, unknown>;

/** Merged refs, the same function for the same two: made during a render, they mustn't be new each time */
const merges = new WeakMap<object, WeakMap<object, RefCallback<unknown>>>();
function stableMerge(a: Ref<unknown> | undefined, b: Ref<unknown> | undefined): Ref<unknown> | undefined {
  if (!a || !b) return a ?? b;
  let byB = merges.get(a);
  if (!byB) merges.set(a, (byB = new WeakMap()));
  let merged = byB.get(b);
  if (!merged) byB.set(b, (merged = mergeRefs(a, b)));
  return merged;
}

/**
 * Our props and an element's of yours as one: classes joined, styles merged (yours on top), event
 * handlers both called (yours first; ours skipped if yours prevented the default), refs both set,
 * anything else yours
 */
export function mergeProps(ours: Props, yours: Props): Props {
  const merged: Props = { ...ours, ...yours };
  for (const key of Object.keys(ours)) {
    const a = ours[key];
    const b = yours[key];
    if (b === undefined) {
      merged[key] = a;
    } else if (key === "className") {
      merged[key] = [a, b].filter(Boolean).join(" ");
    } else if (key === "style") {
      merged[key] = { ...(a as object), ...(b as object) };
    } else if (/^on[A-Z]/.test(key) && typeof a === "function" && typeof b === "function") {
      merged[key] = (event: { defaultPrevented?: boolean }, ...rest: unknown[]) => {
        (b as (...args: unknown[]) => void)(event, ...rest);
        if (!event?.defaultPrevented) (a as (...args: unknown[]) => void)(event, ...rest);
      };
    } else if (key === "ref") {
      merged[key] = stableMerge(a as Ref<unknown>, b as Ref<unknown>);
    }
  }
  return merged;
}

/**
 * What a part renders as, as in Base UI: an element of yours (`render={<a href="…" />}`), our props
 * merged into it, or a function given our props and the part's state to render with
 */
export type RenderProp<State> = ReactElement | ((props: Props, state: State) => ReactElement);

/** An element's own ref, wherever its React keeps it (a prop in 19, the element in 18) */
const refOf = (element: ReactElement): Ref<unknown> | undefined =>
  ((element.props as Props).ref as Ref<unknown> | undefined) ?? (element as unknown as { ref?: Ref<unknown> }).ref;

/** A part rendered: as `render` says, or as `tag` with our props */
export function renderPart<State>(
  tag: string,
  props: Props,
  render: RenderProp<State> | undefined,
  state: State,
): ReactElement {
  if (typeof render === "function") return render(props, state);
  if (isValidElement(render)) {
    const yours = { ...(render.props as Props), ref: refOf(render) };
    return cloneElement(render, mergeProps(props, yours));
  }
  return createElement(tag, props);
}

/** A data attribute that's there or not: `data-x=""` when on, none when off */
export const flag = (on: boolean | undefined) => (on ? "" : undefined);

/**
 * Settings kept in step with an engine made once: only those that changed since it last took them
 * are handed to its `set()`, after each render. `taken` is what it was made with
 */
export function useSettings<S extends object>(
  engine: { set(settings: Partial<S>): void } | null,
  settings: S,
  taken: { current: S | null },
) {
  useIsomorphicLayoutEffect(() => {
    if (!engine) return;
    const next = changed(taken.current, settings);
    if (next) engine.set(next);
    taken.current = settings;
  });
}

/** Runs `fn` once at the end of this task, however many times it's asked for in it */
export function useBatched(fn: () => void) {
  const latest = useLatest(fn);
  const queued = useRef(false);
  return useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    queueMicrotask(() => {
      queued.current = false;
      latest.current();
    });
  }, [latest]);
}

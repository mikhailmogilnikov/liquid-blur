/**
 * What Fluid Kit's Vue components are made of: their `asChild`, refs that bind an engine to an
 * element, controlled state, and settings kept in step. For its own components; a component
 * of your own can use them too.
 */
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  computed,
  h,
  shallowRef,
  watch,
  type ComputedRef,
  type ShallowRef,
  type Slots,
  type VNode,
  type VNodeArrayChildren,
} from "vue";
import { changed } from "@fluidkit/core/internal";

/** The element a template ref was given: the element itself, or a component's root element */
export function elementOf<E extends Element = HTMLElement>(value: unknown): E | null {
  if (value instanceof Element) return value as E;
  const root = (value as { $el?: unknown } | null)?.$el;
  return root instanceof Element ? (root as E) : null;
}

/** A function ref, as `:ref` takes one: called with the element or component, and `null` when it goes */
export type FunctionRef = (value: unknown) => void;

/**
 * A function ref that binds something to an element: `attach` runs when the element comes, its
 * cleanup when it goes or another comes. Vue calls a function ref again on every render of its
 * element: the same element again does nothing.
 */
export function attachRef<E extends Element = HTMLElement>(attach: (el: E) => void | (() => void)): FunctionRef {
  let current: E | null = null;
  let cleanup: void | (() => void);
  return (value) => {
    const el = elementOf<E>(value);
    if (el === current) return;
    cleanup?.();
    cleanup = undefined;
    current = el;
    if (el) cleanup = attach(el);
  };
}

/** Runs `fn` once at the end of this task, however many times it's asked for in it */
export function batched(fn: () => void) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      fn();
    });
  };
}

/**
 * A value that's the parent's when it gives one (`get()` isn't `undefined`), the component's own
 * otherwise, starting at `initial`; either way, `onChange` hears of every change asked for
 */
export function useControllable<T>(
  get: () => T | undefined,
  initial: T,
  onChange?: (value: T) => void,
): { value: ComputedRef<T>; set(value: T): void; own: ShallowRef<T> } {
  const own = shallowRef(initial);
  const value = computed(() => {
    const given = get();
    return given === undefined ? own.value : given;
  });
  return {
    value,
    own,
    set(next: T) {
      if (get() === undefined) own.value = next;
      onChange?.(next);
    },
  };
}

/**
 * Settings kept in step with an engine made once: only those that changed since it last took them
 * are handed to its `set()`, after each render that changes them. `taken` is what it was made with
 */
export function watchSettings<S extends object>(
  engine: ShallowRef<{ set(settings: Partial<S>): void } | null>,
  settings: () => S,
  taken: { current: S | null },
) {
  watch(
    [engine, settings],
    ([made, next]) => {
      if (!made) return;
      const diff = changed(taken.current, next);
      if (diff) made.set(diff);
      taken.current = next;
    },
    { flush: "post" },
  );
}

/** The first element or component in what a slot rendered: comments and blank text passed over */
function firstNode(nodes: VNodeArrayChildren | undefined): VNode | null {
  for (const node of nodes ?? []) {
    if (Array.isArray(node)) {
      const found = firstNode(node);
      if (found) return found;
      continue;
    }
    if (!node || typeof node !== "object") continue;
    if (node.type === Comment) continue;
    if (node.type === Text && !String(node.children).trim()) continue;
    if (node.type === Fragment) {
      const found = firstNode(node.children as VNodeArrayChildren);
      if (found) return found;
      continue;
    }
    return node;
  }
  return null;
}

/**
 * A part rendered: as `tag` with our props and the default slot inside, or with `asChild`, as the
 * slot's own first element, our props merged into it (classes and styles joined, handlers both
 * called, refs both set), as in Reka UI. The slot is given the part's state either way.
 */
export function renderPart<State>(
  tag: string,
  props: Record<string, unknown>,
  asChild: boolean | undefined,
  slots: Slots,
  state: State,
): VNode {
  const children = slots.default?.(state);
  if (asChild) {
    const child = firstNode(children);
    if (child) return cloneVNode(child, props, true);
  }
  return h(tag, props, children);
}

/** A data attribute that's there or not: `data-x=""` when on, none when off */
export const flag = (on: boolean | undefined) => (on ? "" : undefined);

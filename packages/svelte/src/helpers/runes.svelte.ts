import { untrack } from "svelte";
import { changed } from "@fluidkit/core/internal";

/** An element, as an attachment gives it: `attach` for `{@attach}`, `current` the element or `null` */
export type ElementRef<E extends Element = HTMLElement> = {
  readonly current: E | null;
  /** For `{@attach}`: the element while it's in the page */
  attach(node: Element): () => void;
};

/** Where an attachment puts its element, read reactively: an engine is made once it's there */
export function elementRef<E extends Element = HTMLElement>(): ElementRef<E> {
  let current = $state.raw<E | null>(null);
  return {
    get current() {
      return current;
    },
    attach(node) {
      current = node as E;
      return () => {
        if (current === node) current = null;
      };
    },
  };
}

/**
 * Settings kept in step with an engine made once: only those that changed since it last took them
 * are handed to its `set()`, after the update that changes them. `taken` is what it was made with.
 * In a component's script, or a function called from one
 */
export function syncSettings<S extends object>(
  engine: () => { set(settings: Partial<S>): void } | null,
  settings: () => S,
  taken: { current: S | null },
) {
  $effect(() => {
    const made = engine();
    const next = settings();
    if (!made) return;
    untrack(() => {
      const diff = changed(taken.current, next);
      if (diff) made.set(diff);
      taken.current = next;
    });
  });
}

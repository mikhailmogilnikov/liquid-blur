import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { syncSettings } from "../helpers/index.js";
import { createMorph, type Morph as MorphEngine, type MorphMove, type MorphSettings } from "@fluidkit/core";

export type UseMorphOptions<V extends string = string> = Pick<MorphSettings, "spring"> & {
  /** The state asked for, from the parent. Without it, it's its own */
  value?: V;
  /**
   * The state shown at first, when it's its own; the first one in the page unless given. Not what
   * the states' type is read from: `useMorph(() => ({ defaultValue: "a" }))` still takes `to("b")`
   */
  defaultValue?: NoInfer<V>;
  /** A state asked for: by a trigger, or `to()` */
  onValueChange?: (value: V) => void;
  /** Where the shape goes instead of next to the state it sets off from: out of a parent that would clip it */
  container?: HTMLElement | null;
  /** A flight set off, turning around or heading elsewhere included */
  onStart?: (to: V, from: V) => void;
  /** It came to rest as a state */
  onRest?: (at: V) => void;
  /** Every frame of a flight: how far along it is toward `to`, 0 to 1. `from` is `null` when it started over mid-way */
  onProgress?: (progress: number, to: V, from: V | null) => void;
};

export type UseMorph<V extends string = string> = {
  /** For a state, known by its value: `{@attach morph.state("panel")}` */
  state(value: V): Attachment;
  /** The state asked for; `null` until one is in the page, when it's its own */
  readonly value: V | null;
  /** A flight is under way */
  readonly moving: boolean;
  /** Flows into a state. Resolves when it comes to rest: `true` there, `false` if it was sent elsewhere first */
  to(value: V, move?: MorphMove): Promise<boolean>;
  /** The engine, once a state is in the page */
  readonly morph: MorphEngine | null;
};

/**
 * A morph on elements of yours: attach each state's attachment to it, with its value. Options are a
 * getter, read again as what it reads changes. In a component's script
 *
 *   const morph = useMorph(() => ({ defaultValue: "button" }));
 *   <button {@attach morph.state("button")} onclick={() => morph.to("panel")}>More</button>
 *   <div {@attach morph.state("panel")} class="panel">…</div>
 */
export function useMorph<V extends string = string>(options: () => UseMorphOptions<V> = () => ({})): UseMorph<V> {
  let own = $state<V | null>(untrack(() => options().defaultValue ?? null));
  const value = $derived(options().value ?? own);
  let moving = $state(false);
  /** The states, both ways, in the order they came; `version` changes as they come and go */
  const states = { byValue: new Map<V, HTMLElement>(), byElement: new Map<HTMLElement, V>() };
  let version = $state(0);
  let made: { morph: MorphEngine; container: HTMLElement | null } | null = null;
  let morph = $state.raw<MorphEngine | null>(null);
  const taken: { current: Pick<MorphSettings, "spring"> | null } = { current: null };
  /** Asked for by `to()`, before the value was rendered: resolved once it's flown */
  let waiting: { value: V; move?: MorphMove; resolve: (rested: boolean) => void }[] = [];

  const valueOf = (el: HTMLElement) => states.byElement.get(el) as V;
  const letGo = () => {
    made?.morph.destroy();
    made = null;
    morph = null;
  };

  /** Made, made again or let go, as its states and container came and went */
  const sync = (container: HTMLElement | null) => {
    if (made && made.container !== container) letGo();
    if (made || !states.byValue.size) return;
    const asked = value;
    const initial = (asked !== null && states.byValue.get(asked)) || states.byValue.values().next().value!;
    const spring = options().spring;
    const engine = createMorph({
      states: [...states.byValue.values()],
      initial,
      container: container ?? undefined,
      spring,
      // Always the latest options', so new callbacks never make it again
      onStart: (to, from) => {
        moving = true;
        options().onStart?.(valueOf(to), valueOf(from));
      },
      onRest: (at) => {
        moving = false;
        options().onRest?.(valueOf(at));
      },
      onProgress: (progress, to, from) => options().onProgress?.(progress, valueOf(to), from && valueOf(from)),
    });
    taken.current = { spring };
    made = { morph: engine, container };
    morph = engine;
    // Nothing said where it starts: where it's made is its value now
    if (value === null) own = valueOf(initial);
  };

  const container = $derived(options().container ?? null);
  $effect(() => {
    void version;
    const box = container;
    untrack(() => sync(box));
  });
  // Its component gone: let go, and what waited hears it won't fly
  $effect(() => () => {
    letGo();
    for (const w of waiting) w.resolve(false);
    waiting = [];
  });

  // One attachment per value, so a state isn't let go and taken again each update
  const attachments = new Map<V, Attachment>();
  const state = (v: V) => {
    let attach = attachments.get(v);
    if (!attach) {
      attach = (node) => {
        const el = node as HTMLElement;
        states.byValue.set(v, el);
        states.byElement.set(el, v);
        made?.morph.add(el);
        // Untracked: an attachment runs in an effect, which would otherwise rerun with every state
        untrack(() => version++);
        // The one it's at can't be let go of: the morph is made again, from the others
        return () => {
          if (states.byValue.get(v) === el) states.byValue.delete(v);
          if (made?.morph.current === el) letGo();
          else made?.morph.remove(el);
          states.byElement.delete(el);
          untrack(() => version++);
        };
      };
      attachments.set(v, attach);
    }
    return attach;
  };

  syncSettings(
    () => morph,
    () => ({ spring: options().spring }),
    taken,
  );

  // Where it's asked to be, once that's rendered; what was waiting for it hears how it went
  $effect(() => {
    const engine = morph;
    const asked = value;
    void version;
    if (!engine || asked === null) return;
    untrack(() => {
      const el = states.byValue.get(asked);
      // There or on its way already, with nothing waiting: a state come or gone doesn't send it again
      if (!el || (el === engine.current && !waiting.length)) return;
      const waiters = waiting;
      waiting = [];
      const flown = engine.to(el, waiters.find((w) => w.value === asked)?.move);
      for (const w of waiters) {
        if (w.value === asked) void flown.then(w.resolve);
        else w.resolve(false);
      }
    });
  });

  const to = (v: V, move?: MorphMove): Promise<boolean> => {
    const el = states.byValue.get(v);
    if (!made || !el) return Promise.resolve(false);
    // Asked for already: no update to wait for
    if (value === v) return made.morph.to(el, move);
    const now = untrack(options);
    now.onValueChange?.(v);
    if (now.value === undefined) own = v;
    return new Promise((resolve) => waiting.push({ value: v, move, resolve }));
  };

  return {
    state,
    get value() {
      return value;
    },
    get moving() {
      return moving;
    },
    to,
    get morph() {
      return morph;
    },
  };
}

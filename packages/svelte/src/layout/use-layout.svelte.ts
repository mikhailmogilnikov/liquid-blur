import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { elementRef, syncSettings } from "../helpers/index.js";
import { createLayout, type Layout as LayoutEngine, type LayoutSettings } from "@fluidkit/core";

export type UseLayoutOptions = LayoutSettings & {
  /** Its items, as a selector inside the root: its children unless given */
  items?: string;
};

export type UseLayout = {
  /** For the root whose items move: `{@attach layout.root}` */
  root: Attachment;
  /** Something is on its way */
  readonly moving: boolean;
  /** Reads the layout again and follows it: for a change no watcher sees */
  update(): void;
  /** The engine, once its root is in the page */
  readonly layout: LayoutEngine | null;
};

/** Settings as the engine takes them: the function's own options and the callbacks left out */
const settingsOf = ({ items: _i, onStart: _s, onRest: _r, ...settings }: UseLayoutOptions): LayoutSettings => settings;

/**
 * A layout on a root of yours: attach its attachment to it. Options are a getter, read again as what
 * it reads changes. In a component's script
 *
 *   const list = useLayout(() => ({ size: false }));
 *   <ul {@attach list.root}>{#each todos as todo (todo.id)}<li>{todo.text}</li>{/each}</ul>
 */
export function useLayout(options: () => UseLayoutOptions = () => ({})): UseLayout {
  let moving = $state(false);
  const root = elementRef();
  let layout = $state.raw<LayoutEngine | null>(null);
  const taken: { current: LayoutSettings | null } = { current: null };
  /** The root the engine was made on */
  let madeOn: Element | null = null;

  // Made once its root is in the page, and again for another root or selector. Only those make it
  // again: the rest is handed over as it changes
  const items = $derived(options().items);
  $effect(() => {
    const el = root.current;
    const selector = items;
    if (!el) return;
    const engine = untrack(() => {
      const settings = settingsOf(options());
      const created = createLayout({
        ...settings,
        root: el,
        items: selector,
        // Always the latest options', so new callbacks never make it again
        onStart: () => {
          moving = true;
          options().onStart?.();
        },
        onRest: () => {
          moving = false;
          options().onRest?.();
        },
      });
      taken.current = settings;
      return created;
    });
    madeOn = el;
    layout = engine;
    return () => {
      engine.destroy();
      if (layout === engine) {
        layout = null;
        moving = false;
      }
    };
  });

  syncSettings(
    () => layout,
    () => settingsOf(options()),
    taken,
  );

  /** Its root going: let go now, everything of the layout's off it before Svelte takes it out */
  const attachRoot: Attachment = (node) => {
    const off = root.attach(node);
    return () => {
      off();
      if (layout && madeOn === node) {
        layout.destroy();
        layout = null;
        moving = false;
      }
    };
  };

  return {
    root: attachRoot,
    get moving() {
      return moving;
    },
    update: () => layout?.update(),
    get layout() {
      return layout;
    },
  };
}

import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { elementRef, syncSettings, type ElementRef } from "../helpers/index.js";
import { createLift, type Lift as LiftEngine, type LiftSettings } from "@fluidkit/core";

export type UseLiftOptions = Omit<LiftSettings, "onOpen" | "onClose" | "preview"> & {
  /** Open, from the parent: lifted while `true`. Without it, it's its own */
  open?: boolean;
  /** Open at first, when it's its own */
  defaultOpen?: boolean;
  /** Opened or closed: by a press, a key, a choice, the dim, or `open` */
  onOpenChange?: (open: boolean) => void;
};

export type UseLift = {
  /** For what's held and lifted: `{@attach lift.element}` */
  element: Attachment;
  /** For the menu */
  menu: Attachment;
  /** For a preview of your own, lifted instead of a copy */
  preview: Attachment;
  /** Lifted, its menu open */
  readonly opened: boolean;
  open(): void;
  close(): void;
  /** The engine, once its element is in the page: for what the function doesn't give */
  readonly lift: LiftEngine | null;
};

/** Settings as the engine takes them: the function's own options left out */
const settingsOf = ({ open: _o, defaultOpen: _d, onOpenChange: _c, ...settings }: UseLiftOptions) => settings;
/** The settings handed over as they change: callbacks are always the latest anyway */
const tunedOf = (options: UseLiftOptions) => {
  const { onSelect: _s, onHighlight: _h, ...rest } = settingsOf(options);
  return rest;
};

/**
 * A lift on elements of yours: attach its attachments to them. `opened` follows it, `open()` and
 * `close()` drive it; `open` and `onOpenChange` make it controlled. Options are a getter, read again
 * as what it reads changes. In a component's script
 *
 *   const lift = useLift(() => ({ onSelect: (item) => act(item.dataset.value) }));
 *   <img {@attach lift.element} src={src} alt="" />
 *   <div {@attach lift.menu} role="menu" hidden>…</div>
 */
export function useLift(options: () => UseLiftOptions = () => ({})): UseLift {
  const element = elementRef();
  const menu = elementRef();
  const preview = elementRef();
  let lift = $state.raw<LiftEngine | null>(null);
  let opened = $state(false);
  const taken: { current: ReturnType<typeof tunedOf> | null } = { current: null };

  const letGo = (engine: LiftEngine) => {
    engine.destroy();
    if (lift === engine) lift = null;
  };

  // Made once its element is in the page, and again for another element or menu; the rest it's made
  // with is read as it is then, and handed over as it changes after
  $effect(() => {
    const el = element.current;
    const list = menu.current;
    if (!el) return;
    const engine = untrack(() => {
      const now = options();
      const made = createLift({
        ...settingsOf(now),
        element: el,
        menu: list ?? undefined,
        preview: preview.current ?? undefined,
        // Always the latest options', so new callbacks never make it again
        onSelect: (item) => options().onSelect?.(item),
        onHighlight: (item) => options().onHighlight?.(item),
        onOpen: () => {
          opened = true;
          options().onOpenChange?.(true);
        },
        onClose: () => {
          opened = false;
          options().onOpenChange?.(false);
        },
      });
      taken.current = tunedOf(now);
      if (now.open ?? now.defaultOpen) made.open();
      return made;
    });
    lift = engine;
    return () => letGo(engine);
  });

  syncSettings(
    () => lift,
    () => tunedOf(options()),
    taken,
  );

  // Controlled: it follows `open`
  $effect(() => {
    const engine = lift;
    const open = options().open;
    if (!engine || open === undefined) return;
    untrack(() => {
      if (open && !engine.opened) engine.open();
      if (!open && engine.opened) engine.close();
    });
  });

  /**
   * An element handed to its ref. Going while it's open, its menu or preview is in the lift's
   * dialog, where Svelte wouldn't find it to take it out: the lift is let go at once, and puts them
   * back first
   */
  const attach =
    (ref: ElementRef): Attachment =>
    (node) => {
      const off = ref.attach(node);
      return () => {
        off();
        if (lift?.opened) letGo(lift);
      };
    };

  return {
    element: attach(element),
    menu: attach(menu),
    preview: attach(preview),
    get opened() {
      return opened;
    },
    open: () => lift?.open(),
    close: () => lift?.close(),
    get lift() {
      return lift;
    },
  };
}

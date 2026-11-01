/**
 * Lift for React: `<Lift.Root>` and its parts by default, `useLift()` for markup of your own.
 *
 *   <Lift.Root onSelect={(value) => act(value)}>
 *     <Lift.Target render={<img src={src} alt="" />} />
 *     <Lift.Menu className="menu">
 *       <Lift.Item value="copy">Copy</Lift.Item>
 *       <Lift.Item value="share">Share</Lift.Item>
 *     </Lift.Menu>
 *   </Lift.Root>
 *
 * The lift is made once its target is in the page and given new props with `set()`, never made
 * again for them; a new target or menu element makes it again. Its menu and preview are moved into
 * the lift's dialog while it's open: each sits in a box of its own (`display: contents`) that stays
 * where React put it, so nothing React does around them while open finds them gone.
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
  type ReactNode,
  type RefCallback,
} from "react";
import {
  flag,
  useMergedRefs,
  renderPart,
  useAttach,
  useBatched,
  useIsomorphicLayoutEffect,
  useLatest,
  useSettings,
  type RenderProp,
} from "./helpers";
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
  /** The ref for what's held and lifted */
  element: RefCallback<HTMLElement>;
  /** The ref for the menu */
  menu: RefCallback<HTMLElement>;
  /** The ref for a preview of your own, lifted instead of a copy */
  preview: RefCallback<HTMLElement>;
  /** Lifted, its menu open */
  opened: boolean;
  open(): void;
  close(): void;
  /** The engine, once its element is in the page: for what the hook doesn't give */
  lift: LiftEngine | null;
};

/** Settings as the engine takes them: the hook's own options left out */
const settingsOf = ({ open: _o, defaultOpen: _d, onOpenChange: _c, ...settings }: UseLiftOptions) => settings;

/**
 * A lift on elements of yours: give its refs to them. `opened` follows it, `open()` and `close()`
 * drive it; `open` and `onOpenChange` make it controlled
 */
export function useLift(options: UseLiftOptions = {}): UseLift {
  const latest = useLatest(options);
  const els = useRef<{ element: HTMLElement | null; menu: HTMLElement | null; preview: HTMLElement | null }>({
    element: null,
    menu: null,
    preview: null,
  });
  const made = useRef<{ lift: LiftEngine; element: HTMLElement; menu: HTMLElement | null } | null>(null);
  const taken = useRef<ReturnType<typeof settingsOf> | null>(null);
  const [lift, setLift] = useState<LiftEngine | null>(null);
  const [opened, setOpened] = useState(false);

  /** Made, made again or let go, as its elements came and went in the last commit */
  const sync = useBatched(() => {
    const { element, menu, preview } = els.current;
    if (made.current && (made.current.element !== element || made.current.menu !== menu)) {
      made.current.lift.destroy();
      made.current = null;
      setLift(null);
    }
    if (!made.current && element) {
      const settings = settingsOf(latest.current);
      const engine = createLift({
        ...settings,
        element,
        menu: menu ?? undefined,
        preview: preview ?? undefined,
        // Always the latest props', so new callbacks never make it again
        onSelect: (item) => latest.current.onSelect?.(item),
        onHighlight: (item) => latest.current.onHighlight?.(item),
        onOpen: () => {
          setOpened(true);
          latest.current.onOpenChange?.(true);
        },
        onClose: () => {
          setOpened(false);
          latest.current.onOpenChange?.(false);
        },
      });
      taken.current = settings;
      made.current = { lift: engine, element, menu };
      setLift(engine);
      if (latest.current.open ?? latest.current.defaultOpen) engine.open();
    }
  });

  // Gone with the component: its refs are let go, and `sync` finds no element. Not an effect's
  // cleanup, which React 18's strict mode runs and runs again without letting the refs go
  const bind = (key: "element" | "menu" | "preview") => (el: HTMLElement) => {
    els.current[key] = el;
    sync();
    return () => {
      if (els.current[key] === el) els.current[key] = null;
      // Going while it's open: its menu or preview is in the lift's dialog, where React wouldn't
      // find it to take it out. React lets refs go before it takes elements out, so the lift is let
      // go now, at once, and puts them back first
      if (made.current?.lift.opened) {
        made.current.lift.destroy();
        made.current = null;
        setLift(null);
      }
      sync();
    };
  };
  const element = useAttach(bind("element"));
  const menu = useAttach(bind("menu"));
  const preview = useAttach(bind("preview"));

  // Callbacks are always the latest; the rest handed over as it changes
  const { onSelect: _s, onHighlight: _h, ...rest } = settingsOf(options);
  useSettings(lift, rest, taken as never);

  // Controlled: it follows `open`
  useIsomorphicLayoutEffect(() => {
    if (!lift || options.open === undefined) return;
    if (options.open && !lift.opened) lift.open();
    if (!options.open && lift.opened) lift.close();
  }, [lift, options.open]);

  const open = useCallback(() => made.current?.lift.open(), []);
  const close = useCallback(() => made.current?.lift.close(), []);
  return { element, menu, preview, opened, open, close, lift };
}

// ── Components ──

type ItemHandler = (event: LiftSelectEvent) => void;

type LiftContext = UseLift & {
  /** Each item's own `onSelect`, by its element */
  handlers: Map<HTMLElement, ItemHandler>;
};

const Context = createContext<LiftContext | null>(null);

function useLiftContext(part: string) {
  const context = useContext(Context);
  if (!context) throw new Error(`Lift.${part} has to be inside <Lift.Root>`);
  return context;
}

/** A choice, as an item's `onSelect` hears of it: `preventDefault()` keeps the menu open */
export type LiftSelectEvent = {
  /** The item's `value` */
  value: string;
  /** The item's element */
  item: HTMLElement;
  /** The menu stays open after this choice */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
};

export type LiftRootProps = Omit<UseLiftOptions, "onSelect"> & {
  /** An item chosen: its `value` and element. The menu closes after, unless its own `onSelect` prevented it */
  onSelect?: (value: string, item: HTMLElement) => void;
  children?: ReactNode;
};

/** The lift: its options and state, for the parts inside it. Renders nothing of its own */
function Root({ onSelect, children, ...options }: LiftRootProps) {
  const handlers = useMemo(() => new Map<HTMLElement, ItemHandler>(), []);
  const select = useLatest(onSelect);
  const lift = useLift({
    ...options,
    onSelect: (item) => {
      let prevented = false;
      const event: LiftSelectEvent = {
        value: item.dataset.value ?? "",
        item,
        preventDefault: () => {
          prevented = true;
        },
        get defaultPrevented() {
          return prevented;
        },
      };
      handlers.get(item)?.(event);
      select.current?.(event.value, item);
      return prevented ? false : undefined;
    },
  });
  const context = useMemo(() => ({ ...lift, handlers }), [lift, handlers]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

/** What a part's `render` gets as its state */
export type LiftState = { opened: boolean };

type PartProps<State> = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Render as an element of yours, or a function of the props and state; a `div` unless given */
  render?: RenderProp<State>;
  children?: ReactNode;
};

/** What's held and lifted */
const Target = forwardRef<HTMLElement, PartProps<LiftState>>(function LiftTarget({ render, ...props }, ref) {
  const lift = useLiftContext("Target");
  const merged = useMergedRefs(lift.element, ref);
  return renderPart("div", { ...props, ref: merged, "data-state": lift.opened ? "open" : "closed" }, render, {
    opened: lift.opened,
  });
});

/** A box of its own that stays put while what's in it is moved into the lift's dialog */
const Stay = ({ children, hide = false }: { children: ReactNode; hide?: boolean }) => (
  <div style={{ display: hide ? "none" : "contents" }}>{children}</div>
);

/** The menu, opened beside it; hidden until then. Its items are `Lift.Item`s */
const Menu = forwardRef<HTMLElement, PartProps<LiftState>>(function LiftMenu({ render, ...props }, ref) {
  const lift = useLiftContext("Menu");
  const merged = useMergedRefs(lift.menu, ref);
  return (
    <Stay>
      {renderPart(
        "div",
        {
          role: "menu",
          hidden: true,
          ...props,
          ref: merged,
          "data-state": lift.opened ? "open" : "closed",
        },
        render,
        { opened: lift.opened },
      )}
    </Stay>
  );
});

/** Lifted instead of a copy: something live, or a bigger preview, at its own size */
const Preview = forwardRef<HTMLElement, PartProps<LiftState>>(function LiftPreview({ render, ...props }, ref) {
  const lift = useLiftContext("Preview");
  const merged = useMergedRefs(lift.preview, ref);
  return <Stay hide>{renderPart("div", { ...props, ref: merged }, render, { opened: lift.opened })}</Stay>;
});

export type LiftItemState = { disabled: boolean };

export type LiftItemProps = Omit<PartProps<LiftItemState>, "onSelect"> & {
  /** What `onSelect` on the root is given for it */
  value?: string;
  /** Not chosen, by anything; passed over by the arrow keys */
  disabled?: boolean;
  /** Chosen: before the root hears of it. `event.preventDefault()` keeps the menu open */
  onSelect?: (event: LiftSelectEvent) => void;
};

/** An item of the menu: a `button` unless rendered as something else */
const Item = forwardRef<HTMLElement, LiftItemProps>(function LiftItem(
  { render, value, disabled = false, onSelect, ...props },
  ref,
) {
  const { handlers } = useLiftContext("Item");
  const handler = useLatest(onSelect);
  const own = useAttach<HTMLElement>((el) => {
    handlers.set(el, (event) => handler.current?.(event));
    return () => handlers.delete(el);
  });
  const merged = useMergedRefs(own, ref);
  return renderPart(
    "button",
    {
      type: "button",
      role: "menuitem",
      ...props,
      ref: merged,
      "data-value": value,
      "aria-disabled": disabled || undefined,
      "data-disabled": flag(disabled),
    },
    render,
    { disabled },
  );
});

/** A line between items, passed over by the finger and the keys */
const Separator = forwardRef<HTMLElement, Omit<PartProps<Record<string, never>>, "children">>(function LiftSeparator(
  { render, ...props },
  ref,
) {
  return renderPart("div", { role: "separator", ...props, ref }, render, {});
});

/** The lift's state and refs inside `<Lift.Root>`: for a part of your own */
export function useLiftParts() {
  return useLiftContext("parts");
}

/** Lift's parts: `Root`, `Target`, `Menu`, `Item`, `Separator`, `Preview` */
export const Lift = { Root, Target, Menu, Item, Separator, Preview };

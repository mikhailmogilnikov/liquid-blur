/**
 * Lift for Vue: `<Lift.Root>` and its parts by default, `useLift()` for markup of your own.
 *
 *   <Lift.Root @select="(value) => act(value)">
 *     <Lift.Target as-child><img :src="src" alt="" /></Lift.Target>
 *     <Lift.Menu class="menu">
 *       <Lift.Item value="copy">Copy</Lift.Item>
 *       <Lift.Item value="share">Share</Lift.Item>
 *     </Lift.Menu>
 *   </Lift.Root>
 *
 * The lift is made once its target is in the page and given new props with `set()`, never made
 * again for them; a new target or menu element makes it again. Its menu and preview are moved into
 * the lift's dialog while it's open: each sits in a box of its own (`display: contents`) that stays
 * where Vue put it, so nothing Vue does around them while open finds them gone.
 */
import {
  defineComponent,
  h,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  watch,
  type InjectionKey,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
  type ShallowRef,
  type SlotsType,
  type VNode,
} from "vue";
import { attachRef, batched, flag, renderPart, watchSettings, type FunctionRef } from "./helpers";
import { createLift, type Lift as LiftEngine, type LiftSettings, type SpringParams } from "@fluidkit/core";

export type UseLiftOptions = Omit<LiftSettings, "onOpen" | "onClose" | "preview"> & {
  /** Open, from the parent: lifted while `true`. Without it, it's its own */
  open?: boolean;
  /** Open at first, when it's its own */
  defaultOpen?: boolean;
  /** Opened or closed: by a press, a key, a choice, the dim, or `open` */
  onOpenChange?: (open: boolean) => void;
};

export type UseLift = {
  /** The ref for what's held and lifted: `:ref="lift.element"` */
  element: FunctionRef;
  /** The ref for the menu */
  menu: FunctionRef;
  /** The ref for a preview of your own, lifted instead of a copy */
  preview: FunctionRef;
  /** Lifted, its menu open */
  opened: Readonly<Ref<boolean>>;
  open(): void;
  close(): void;
  /** The engine, once its element is in the page: for what the composable doesn't give */
  lift: Readonly<ShallowRef<LiftEngine | null>>;
};

/** Settings as the engine takes them: the composable's own options left out */
const settingsOf = ({ open: _o, defaultOpen: _d, onOpenChange: _c, ...settings }: UseLiftOptions) => settings;

/**
 * A lift on elements of yours: give its refs to them. `opened` follows it, `open()` and `close()`
 * drive it; `open` and `onOpenChange` make it controlled. Options can be a ref or a getter, read
 * again as they change
 */
export function useLift(options: MaybeRefOrGetter<UseLiftOptions> = {}): UseLift {
  const latest = () => toValue(options);
  const els: { element: HTMLElement | null; menu: HTMLElement | null; preview: HTMLElement | null } = {
    element: null,
    menu: null,
    preview: null,
  };
  let made: { lift: LiftEngine; element: HTMLElement; menu: HTMLElement | null } | null = null;
  const taken: { current: ReturnType<typeof settingsOf> | null } = { current: null };
  const lift = shallowRef<LiftEngine | null>(null);
  const opened = shallowRef(false);
  let disposed = false;

  const letGo = () => {
    made?.lift.destroy();
    made = null;
    lift.value = null;
  };

  /** Made, made again or let go, as its elements came and went in the last render */
  const sync = batched(() => {
    if (disposed) return;
    const { element, menu, preview } = els;
    if (made && (made.element !== element || made.menu !== menu)) letGo();
    if (!made && element) {
      const settings = settingsOf(latest());
      const engine = createLift({
        ...settings,
        element,
        menu: menu ?? undefined,
        preview: preview ?? undefined,
        // Always the latest options', so new callbacks never make it again
        onSelect: (item) => latest().onSelect?.(item),
        onHighlight: (item) => latest().onHighlight?.(item),
        onOpen: () => {
          opened.value = true;
          latest().onOpenChange?.(true);
        },
        onClose: () => {
          opened.value = false;
          latest().onOpenChange?.(false);
        },
      });
      taken.current = settings;
      made = { lift: engine, element, menu };
      lift.value = engine;
      const now = latest();
      if (now.open ?? now.defaultOpen) engine.open();
    }
  });

  const bind = (key: keyof typeof els) =>
    attachRef((el) => {
      els[key] = el;
      sync();
      return () => {
        if (els[key] === el) els[key] = null;
        // Going while it's open: its menu or preview is in the lift's dialog, where Vue wouldn't
        // find it to take it out. Vue lets refs go before it takes elements out, so the lift is let
        // go now, at once, and puts them back first
        if (made?.lift.opened) letGo();
        sync();
      };
    });

  // Callbacks are always the latest; the rest handed over as it changes
  watchSettings(
    lift,
    () => {
      const { onSelect: _s, onHighlight: _h, ...rest } = settingsOf(latest());
      return rest;
    },
    taken as never,
  );

  // Controlled: it follows `open`
  watch(
    [lift, () => latest().open],
    ([engine, open]) => {
      if (!engine || open === undefined) return;
      if (open && !engine.opened) engine.open();
      if (!open && engine.opened) engine.close();
    },
    { flush: "post" },
  );

  // Its component gone: let go before Vue takes the elements out
  onScopeDispose(() => {
    disposed = true;
    letGo();
  });

  return {
    element: bind("element"),
    menu: bind("menu"),
    preview: bind("preview"),
    opened,
    open: () => made?.lift.open(),
    close: () => made?.lift.close(),
    lift,
  };
}

// ── Components ──

/** A choice, as an item's `select` event hears of it: `preventDefault()` keeps the menu open */
export type LiftSelectEvent = {
  /** The item's `value` */
  value: string;
  /** The item's element */
  item: HTMLElement;
  /** The menu stays open after this choice */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
};

type ItemHandler = (event: LiftSelectEvent) => void;

type LiftContext = UseLift & {
  /** Each item's own `select`, by its element */
  handlers: Map<HTMLElement, ItemHandler>;
};

const LiftKey: InjectionKey<LiftContext> = Symbol("fluidkit-lift");

function useLiftContext(part: string) {
  const context = inject(LiftKey, null);
  if (!context) throw new Error(`Lift.${part} has to be inside <Lift.Root>`);
  return context;
}

/** What a part's slot gets */
export type LiftState = { opened: boolean };

const asChild = {
  type: Boolean,
  default: false,
} as const;

/** The lift: its props and state, for the parts inside it. Renders nothing of its own */
const Root = defineComponent({
  name: "LiftRoot",
  props: {
    /** Lifted while `true`: controlled, with `v-model:open`. Without it, it's its own */
    open: { type: Boolean, default: undefined },
    /** Lifted at first, when it's its own */
    defaultOpen: { type: Boolean, default: false },
    /** How long a press is held, ms: 500 by default */
    delay: Number,
    /** How much bigger it's lifted: 1.04 by default */
    scale: Number,
    /** How dark the page goes behind it, 0 to 1: 0.2 by default */
    dim: Number,
    /** How blurred the page goes behind it, px: 12 by default */
    blur: Number,
    /** Where the menu goes: by the room there unless given */
    placement: String as PropType<"auto" | "below" | "above">,
    /** The spring it rises on */
    spring: Object as PropType<SpringParams>,
    /** What counts as an item in the menu, as a selector */
    items: String,
  },
  emits: {
    /** Opened or closed */
    "update:open": (_open: boolean) => true,
    /** An item chosen: its `value` and element. The menu closes after, unless its own `select` prevented it */
    select: (_value: string, _item: HTMLElement) => true,
    /** The finger that lifted it is over this item, or `null` off them */
    highlight: (_item: HTMLElement | null) => true,
  },
  slots: Object as SlotsType<{ default: LiftState }>,
  setup(props, { emit, slots }) {
    const handlers = new Map<HTMLElement, ItemHandler>();
    const lift = useLift(() => ({
      open: props.open,
      defaultOpen: props.defaultOpen,
      delay: props.delay,
      scale: props.scale,
      dim: props.dim,
      blur: props.blur,
      placement: props.placement,
      spring: props.spring,
      items: props.items,
      onOpenChange: (open) => emit("update:open", open),
      onHighlight: (item) => emit("highlight", item),
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
        emit("select", event.value, item);
        return prevented ? false : undefined;
      },
    }));
    provide(LiftKey, { ...lift, handlers });
    return () => slots.default?.({ opened: lift.opened.value });
  },
});

/** What's held and lifted: a `div`, or with `as-child` the element in its slot */
const Target = defineComponent({
  name: "LiftTarget",
  inheritAttrs: false,
  props: { asChild },
  slots: Object as SlotsType<{ default: LiftState }>,
  setup(props, { attrs, slots }) {
    const lift = useLiftContext("Target");
    return () =>
      renderPart(
        "div",
        { ...attrs, ref: lift.element, "data-state": lift.opened.value ? "open" : "closed" },
        props.asChild,
        slots,
        { opened: lift.opened.value },
      );
  },
});

/** A box of its own that stays put while what's in it is moved into the lift's dialog */
const stay = (child: VNode, hide = false) => h("div", { style: { display: hide ? "none" : "contents" } }, [child]);

/** The menu, opened beside it; hidden until then. Its items are `Lift.Item`s */
const Menu = defineComponent({
  name: "LiftMenu",
  inheritAttrs: false,
  props: { asChild },
  slots: Object as SlotsType<{ default: LiftState }>,
  setup(props, { attrs, slots }) {
    const lift = useLiftContext("Menu");
    return () =>
      stay(
        renderPart(
          "div",
          {
            role: "menu",
            hidden: true,
            ...attrs,
            ref: lift.menu,
            "data-state": lift.opened.value ? "open" : "closed",
          },
          props.asChild,
          slots,
          { opened: lift.opened.value },
        ),
      );
  },
});

/** Lifted instead of a copy: something live, or a bigger preview, at its own size */
const Preview = defineComponent({
  name: "LiftPreview",
  inheritAttrs: false,
  props: { asChild },
  slots: Object as SlotsType<{ default: LiftState }>,
  setup(props, { attrs, slots }) {
    const lift = useLiftContext("Preview");
    return () =>
      stay(
        renderPart("div", { ...attrs, ref: lift.preview }, props.asChild, slots, { opened: lift.opened.value }),
        true,
      );
  },
});

export type LiftItemState = { disabled: boolean };

/** An item of the menu: a `button`, or with `as-child` the element in its slot */
const Item = defineComponent({
  name: "LiftItem",
  inheritAttrs: false,
  props: {
    /** What `select` on the root is given for it */
    value: String,
    /** Not chosen, by anything; passed over by the arrow keys */
    disabled: { type: Boolean, default: false },
    asChild,
  },
  emits: {
    /** Chosen: before the root hears of it. `event.preventDefault()` keeps the menu open */
    select: (_event: LiftSelectEvent) => true,
  },
  slots: Object as SlotsType<{ default: LiftItemState }>,
  setup(props, { attrs, slots, emit }) {
    const { handlers } = useLiftContext("Item");
    const own = attachRef((el) => {
      handlers.set(el, (event) => emit("select", event));
      return () => handlers.delete(el);
    });
    return () =>
      renderPart(
        "button",
        {
          type: "button",
          role: "menuitem",
          ...attrs,
          ref: own,
          "data-value": props.value,
          "aria-disabled": props.disabled || undefined,
          "data-disabled": flag(props.disabled),
        },
        props.asChild,
        slots,
        { disabled: props.disabled },
      );
  },
});

/** A line between items, passed over by the finger and the keys */
const Separator = defineComponent({
  name: "LiftSeparator",
  inheritAttrs: false,
  props: { asChild },
  setup(props, { attrs, slots }) {
    return () => renderPart("div", { role: "separator", ...attrs }, props.asChild, slots, {});
  },
});

/** The lift's state and refs inside `<Lift.Root>`: for a part of your own */
export function useLiftParts() {
  return useLiftContext("parts");
}

/** Lift's parts: `Root`, `Target`, `Menu`, `Item`, `Separator`, `Preview` */
export const Lift = { Root, Target, Menu, Item, Separator, Preview };

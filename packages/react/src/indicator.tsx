/**
 * Indicator for React: `<Indicator.Root>` and its parts by default, `useIndicator()` for markup of
 * your own.
 *
 *   <Indicator.Root value={tab} onValueChange={setTab} trigger="press">
 *     <Indicator.Thumb className="thumb" />
 *     <Indicator.Item value="overview">Overview</Indicator.Item>
 *     <Indicator.Item value="releases">Releases</Indicator.Item>
 *   </Indicator.Root>
 *
 * Items are known by their `value`. `value` is the one chosen, where the indicator rests: a click
 * on an item chooses it (a press dragged across and let go on one, too). `active` is one pointed at
 * by something else, the finger on a lift's menu, say, followed as it changes.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
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
  useControllable,
  useIsomorphicLayoutEffect,
  useLatest,
  useSettings,
  type RenderProp,
} from "./helpers";
import { createIndicator, type Indicator as IndicatorEngine, type IndicatorSettings } from "@fluidkit/core";

/** The attribute that marks a root's items, so a selector finds its own and not a nested root's */
const ITEM = "data-fk-indicator-item";

export type UseIndicatorOptions<V extends string = string> = Omit<IndicatorSettings, "items" | "onChange"> & {
  /** The item chosen, from the parent: where it rests. Without it, the choice is its own */
  value?: V | null;
  /** Chosen at first, when the choice is its own. Not what the items' type is read from */
  defaultValue?: NoInfer<V> | null;
  /** An item chosen: by a click on it, or a press let go on it */
  onValueChange?: (value: V) => void;
  /** An item pointed at by something else, followed; `null`, back to rest */
  active?: V | null;
  /** The item it's on changed: pointed at, focused, chosen, or `null` gone */
  onActiveChange?: (value: V | null) => void;
};

export type UseIndicator<V extends string = string> = {
  /** The ref for the container its items and the indicator are in */
  container: RefCallback<HTMLElement>;
  /** The ref for the indicator */
  indicator: RefCallback<HTMLElement>;
  /** The ref for an item, known by its value */
  item(value: V): RefCallback<HTMLElement>;
  /** The item chosen */
  value: V | null;
  /** The item it's on now, or `null` */
  active: V | null;
  /** Chooses an item, as a click on it would */
  select(value: V): void;
  /** The engine, once its elements are in the page */
  engine: IndicatorEngine | null;
};

const settingsOf = <V extends string>({
  value: _v,
  defaultValue: _d,
  onValueChange: _c,
  active: _a,
  onActiveChange: _ac,
  ...settings
}: UseIndicatorOptions<V>) => settings;

/** An indicator on elements of yours: give its refs to them, each item's with its value */
export function useIndicator<V extends string = string>(options: UseIndicatorOptions<V> = {}): UseIndicator<V> {
  const id = useId();
  const latest = useLatest(options);
  const [value, choose] = useControllable<V | null>(options.value, options.defaultValue ?? null, (v) => {
    if (v !== null) latest.current.onValueChange?.(v);
  });
  const [active, setActive] = useState<V | null>(null);
  const els = useRef<{ container: HTMLElement | null; indicator: HTMLElement | null }>({
    container: null,
    indicator: null,
  });
  /** The items, both ways */
  const items = useRef({ byValue: new Map<V, HTMLElement>(), byElement: new Map<HTMLElement, V>() });
  const made = useRef<{ engine: IndicatorEngine; container: HTMLElement; indicator: HTMLElement } | null>(null);
  const taken = useRef<ReturnType<typeof settingsOf<V>> | null>(null);
  const [engine, setEngine] = useState<IndicatorEngine | null>(null);
  const chosen = useLatest(value);

  const sync = useBatched(() => {
    const { container, indicator } = els.current;
    if (made.current && (made.current.container !== container || made.current.indicator !== indicator)) {
      made.current.engine.destroy();
      made.current = null;
      setEngine(null);
    }
    if (!made.current && container && indicator) {
      const settings = settingsOf(latest.current);
      const restOn = chosen.current === null ? null : (items.current.byValue.get(chosen.current) ?? null);
      const made_ = createIndicator({
        ...settings,
        container,
        indicator,
        items: `[${ITEM}="${CSS.escape(id)}"]`,
        rest: restOn,
        onChange: (item) => {
          const v = item ? (items.current.byElement.get(item) ?? null) : null;
          setActive(v);
          latest.current.onActiveChange?.(v);
        },
      });
      taken.current = settings;
      made.current = { engine: made_, container, indicator };
      setEngine(made_);
    }
  });

  const bind = (key: "container" | "indicator") => (el: HTMLElement) => {
    els.current[key] = el;
    sync();
    return () => {
      if (els.current[key] === el) els.current[key] = null;
      sync();
    };
  };
  const container = useAttach(bind("container"));
  const indicator = useAttach(bind("indicator"));

  // One stable ref per value, so React doesn't let an item go and take it again each render
  const refs = useRef(new Map<V, RefCallback<HTMLElement>>());
  const select = useCallback((v: V) => choose(v), [choose]);
  const pick = useLatest(select);
  const item = useCallback(
    (v: V) => {
      let ref = refs.current.get(v);
      if (!ref) {
        let cleanup: (() => void) | null = null;
        ref = (el: HTMLElement | null) => {
          cleanup?.();
          cleanup = null;
          if (!el) return;
          el.setAttribute(ITEM, id);
          items.current.byValue.set(v, el);
          items.current.byElement.set(el, v);
          // A click chooses it: a press let go on it clicks it too
          const onClick = () => pick.current(v);
          el.addEventListener("click", onClick);
          cleanup = () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute(ITEM);
            if (items.current.byValue.get(v) === el) items.current.byValue.delete(v);
            items.current.byElement.delete(el);
          };
        };
        refs.current.set(v, ref);
      }
      return ref;
    },
    [id, pick],
  );

  useSettings(engine, settingsOf(options), taken);

  // Where it rests: the item chosen, as it changes or its element does
  useIsomorphicLayoutEffect(() => {
    if (!engine) return;
    const el = value === null ? null : (items.current.byValue.get(value) ?? null);
    if (engine.rest !== el) engine.rest = el;
  });

  // Pointed at by something else: followed, and back to rest when it's `null`
  useIsomorphicLayoutEffect(() => {
    if (!engine || options.active === undefined) return;
    const el = options.active === null ? engine.rest : (items.current.byValue.get(options.active) ?? null);
    engine.to(el);
  }, [engine, options.active]);

  return { container, indicator, item, value, active, select, engine };
}

// ── Components ──

const Context = createContext<UseIndicator | null>(null);

function useIndicatorContext(part: string) {
  const context = useContext(Context);
  if (!context) throw new Error(`Indicator.${part} has to be inside <Indicator.Root>`);
  return context;
}

type PartProps<State> = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Render as an element of yours, or a function of the props and state */
  render?: RenderProp<State>;
  children?: ReactNode;
};

export type IndicatorRootProps<V extends string = string> = UseIndicatorOptions<V> &
  PartProps<{ value: V | null; active: V | null }>;

/** The container of its items and its indicator: a `div` unless rendered as something else */
const Root = forwardRef<HTMLElement, IndicatorRootProps>(function IndicatorRoot(props, ref) {
  const {
    value,
    defaultValue,
    onValueChange,
    active,
    onActiveChange,
    trigger,
    click,
    focus,
    spring,
    render,
    children,
    ...rest
  } = props;
  const indicator = useIndicator({
    value,
    defaultValue,
    onValueChange,
    active,
    onActiveChange,
    trigger,
    click,
    focus,
    spring,
  });
  const context = useMemo(() => indicator, [indicator]);
  const merged = useMergedRefs(indicator.container, ref);
  return (
    <Context.Provider value={context}>
      {renderPart("div", { ...rest, children, ref: merged, style: { position: "relative", ...rest.style } }, render, {
        value: indicator.value,
        active: indicator.active,
      })}
    </Context.Provider>
  );
});

/** The one element that flies onto the items: a `span`, under them, unless rendered as something else */
const Thumb = forwardRef<HTMLElement, Omit<PartProps<Record<string, never>>, "children">>(function IndicatorThumb(
  { render, ...props },
  ref,
) {
  const indicator = useIndicatorContext("Thumb");
  const merged = useMergedRefs(indicator.indicator, ref);
  return renderPart(
    "span",
    { "aria-hidden": true, ...props, ref: merged, style: { position: "absolute", zIndex: -1, ...props.style } },
    render,
    {},
  );
});

export type IndicatorItemState = { selected: boolean; active: boolean };

export type IndicatorItemProps = PartProps<IndicatorItemState> & {
  /** What it's known by: what `value` and `onValueChange` say */
  value: string;
};

/** An item: a `button` unless rendered as something else; chosen by a click */
const Item = forwardRef<HTMLElement, IndicatorItemProps>(function IndicatorItem({ render, value, ...props }, ref) {
  const indicator = useIndicatorContext("Item");
  const selected = indicator.value === value;
  const active = indicator.active === value;
  const merged = useMergedRefs(indicator.item(value), ref);
  return renderPart(
    "button",
    {
      type: "button",
      ...props,
      ref: merged,
      "data-selected": flag(selected),
      "data-active": flag(active),
    },
    render,
    { selected, active },
  );
});

/** The indicator's state and refs inside `<Indicator.Root>`: for a part of your own */
export function useIndicatorParts() {
  return useIndicatorContext("parts");
}

/** Indicator's parts: `Root`, `Thumb`, `Item` */
export const Indicator = { Root, Thumb, Item };

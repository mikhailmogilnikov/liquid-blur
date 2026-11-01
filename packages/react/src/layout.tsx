/**
 * Layout for React: `<Layout.Root>` by default, `useLayout()` for markup of your own.
 *
 *   <Layout.Root render={<ul className="list" />}>
 *     {todos.map((todo) => <li key={todo.id}>{todo.text}</li>)}
 *   </Layout.Root>
 *
 * Its items are its children (or what `items` selects in it): rows React puts in, takes out or
 * moves by their keys, classes it changes, sizes that change, all followed as the page changes
 * them. The layout is made once its root is in the page and given new props with `set()`, never
 * made again for them; another root or `items` makes it again.
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
  renderPart,
  useAttach,
  useBatched,
  useIsomorphicLayoutEffect,
  useLatest,
  useMergedRefs,
  useSettings,
  type RenderProp,
} from "./helpers";
import { createLayout, type Layout as LayoutEngine, type LayoutSettings } from "@fluidkit/core";

export type UseLayoutOptions = LayoutSettings & {
  /** Its items, as a selector inside the root: its children unless given */
  items?: string;
};

export type UseLayout = {
  /** The ref for the root whose items move */
  root: RefCallback<HTMLElement>;
  /** Something is on its way */
  moving: boolean;
  /** Reads the layout again and follows it: for a change no watcher sees */
  update(): void;
  /** The engine, once its root is in the page: for what the hook doesn't give */
  layout: LayoutEngine | null;
};

/** Settings as the engine takes them: the hook's own options and the callbacks left out */
const settingsOf = ({ items: _i, onStart: _s, onRest: _r, ...settings }: UseLayoutOptions): LayoutSettings => settings;

/** A layout on a root of yours: give its ref to it */
export function useLayout(options: UseLayoutOptions = {}): UseLayout {
  const latest = useLatest(options);
  const [moving, setMoving] = useState(false);
  const el = useRef<HTMLElement | null>(null);
  const made = useRef<{ layout: LayoutEngine; root: HTMLElement; items: string | undefined } | null>(null);
  const taken = useRef<LayoutSettings | null>(null);
  const [layout, setLayout] = useState<LayoutEngine | null>(null);

  const letGo = () => {
    made.current?.layout.destroy();
    made.current = null;
    setLayout(null);
    setMoving(false);
  };

  /** Made, made again or let go, as its root came and went in the last commit */
  const sync = useBatched(() => {
    const root = el.current;
    const items = latest.current.items;
    if (made.current) {
      if (made.current.root === root && made.current.items === items) return;
      letGo();
    }
    if (!root) return;
    const settings = settingsOf(latest.current);
    const engine = createLayout({
      ...settings,
      root,
      items,
      // Always the latest props', so new callbacks never make it again
      onStart: () => {
        setMoving(true);
        latest.current.onStart?.();
      },
      onRest: () => {
        setMoving(false);
        latest.current.onRest?.();
      },
    });
    taken.current = settings;
    made.current = { layout: engine, root, items };
    setLayout(engine);
  });

  const root = useAttach((node: HTMLElement) => {
    el.current = node;
    sync();
    return () => {
      if (el.current === node) el.current = null;
      // Its root going: let go now, everything of the layout's off it before React takes it out
      if (made.current?.root === node) letGo();
      sync();
    };
  });

  useSettings(layout, settingsOf(options), taken);

  // Another selector: made again
  useIsomorphicLayoutEffect(() => {
    if (made.current && made.current.items !== options.items) sync();
  });

  const update = useCallback(() => made.current?.layout.update(), []);

  return useMemo(() => ({ root, moving, update, layout }), [root, moving, update, layout]);
}

// ── Components ──

const Context = createContext<UseLayout | null>(null);

type PartProps<State> = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Render as an element of yours, or a function of the props and state; a `div` unless given */
  render?: RenderProp<State>;
  children?: ReactNode;
};

/** What a part's `render` gets as its state */
export type LayoutState = { moving: boolean };

export type LayoutRootProps = UseLayoutOptions & PartProps<LayoutState>;

/**
 * The root whose items move: a `div` unless rendered as something else, its children the items.
 * Marked `data-moving` while something is on its way
 */
const Root = forwardRef<HTMLElement, LayoutRootProps>(function LayoutRoot(props, ref) {
  const { items, spring, size, enter, exit, onStart, onRest, render, ...rest } = props;
  const layout = useLayout({ items, spring, size, enter, exit, onStart, onRest });
  const merged = useMergedRefs(layout.root, ref);
  return (
    <Context.Provider value={layout}>
      {renderPart("div", { ...rest, ref: merged, "data-moving": flag(layout.moving) }, render, {
        moving: layout.moving,
      })}
    </Context.Provider>
  );
});

/** The layout inside `<Layout.Root>`: for a part of your own */
export function useLayoutParts() {
  const context = useContext(Context);
  if (!context) throw new Error("useLayoutParts() has to be inside <Layout.Root>");
  return context;
}

/** Layout's part: `Root` */
export const Layout = { Root };

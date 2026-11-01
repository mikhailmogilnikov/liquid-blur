/**
 * Liquid Blur for React: `<Glass>`, glass with its variants as props, and `<Glass.Group>`, glass
 * that melts between its children.
 *
 *   <Glass render={<button />} interactive tint="#0a84ff">Follow</Glass>
 *   <Glass.Group className="toolbar">
 *     <Glass>…</Glass>
 *     <Glass interactive render={<button />}>…</Glass>
 *   </Glass.Group>
 *
 * The material is the stylesheet's (`@fluidkit/react/style.css`, imported once): `<Glass>` is its
 * classes and custom properties, written for you. A press prop installs press on its document the
 * first time it's there, nothing to set up at the root; glass with press classes of your own takes
 * `usePress()`. A group is made once its root is in the page and let go of when it goes.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefCallback,
} from "react";
import { useAttach, useMergedRefs, renderPart, type RenderProp } from "./helpers";
import { createGlassGroup, installPress, type GlassGroup } from "@fluidkit/core";
import { groupStyle, presses, variants, type GlassVariants } from "@fluidkit/core/internal";

/** Press installed on the document from an effect: the same install however many ask for it */
export function usePress() {
  useEffect(() => {
    installPress();
  }, []);
}

export type { GlassVariants };

/** The classes and custom properties for these variants: for glass that isn't `<Glass>` */
export function glass(given: GlassVariants = {}): { className: string; style: CSSProperties } {
  const { classes, style } = variants(given);
  return { className: classes, style: style as CSSProperties };
}

type PartProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Render as an element of yours, or a function of the props; a `div` unless given */
  render?: RenderProp<Record<string, never>>;
  children?: ReactNode;
};

export type GlassProps = PartProps & GlassVariants;

/** Glass: a `div` unless rendered as something else, its variants as props, your classes and styles kept */
const Root = forwardRef<HTMLElement, GlassProps>(function Glass(props, ref) {
  const { clear, tint, lens, transparency, depth, interactive, highlight, swell, stretch, render, ...rest } = props;
  const variants = { clear, tint, lens, transparency, depth, interactive, highlight, swell, stretch };
  const own = useRef<HTMLElement | null>(null);
  const pressed = presses(variants);
  // Press on its own document, an iframe's too, the first time glass there needs it
  useEffect(() => {
    if (pressed && own.current) installPress(own.current.ownerDocument);
  }, [pressed]);
  const merged = useMergedRefs(own, ref);
  const { className, style } = glass(variants);
  return renderPart(
    "div",
    {
      ...rest,
      ref: merged,
      className: [className, rest.className].filter(Boolean).join(" "),
      style: { ...style, ...rest.style },
    },
    render,
    {},
  );
});

export type UseGlassGroup = {
  /** The ref for the group's root, written `lb lb-group` */
  root: RefCallback<HTMLElement>;
  /** The group, once its root is in the page: `update()` it after something it can't see moves a child */
  group: GlassGroup | null;
};

/** A glass group on a root of yours, made once it's in the page and let go of when it goes */
export function useGlassGroup(): UseGlassGroup {
  const [group, setGroup] = useState<GlassGroup | null>(null);
  const root = useAttach<HTMLElement>((el) => {
    const made = createGlassGroup(el);
    setGroup(made);
    return () => {
      made.destroy();
      setGroup(null);
    };
  });
  return { root, group };
}

export type GlassGroupProps = PartProps &
  Pick<GlassVariants, "transparency" | "depth"> & {
    /** How close children come before they melt, px: 18 unless given (`--lb-merge`) */
    merge?: number;
  };

/**
 * Glass that melts between its children where they come close: a `div` unless rendered as
 * something else, written `lb lb-group`. Its children are glass, `<Glass>` or `lb`
 */
const Group = forwardRef<HTMLElement, GlassGroupProps>(function GlassGroupRoot(
  { transparency, depth, merge, render, ...rest },
  ref,
) {
  const { root } = useGlassGroup();
  const merged = useMergedRefs(root, ref);
  const style = groupStyle(transparency, depth, merge);
  return renderPart(
    "div",
    {
      ...rest,
      ref: merged,
      className: ["lb lb-group", rest.className].filter(Boolean).join(" "),
      style: { ...style, ...rest.style },
    },
    render,
    {},
  );
});

/** Glass, and `Glass.Group` for glass that melts */
export const Glass = Object.assign(Root, { Group });

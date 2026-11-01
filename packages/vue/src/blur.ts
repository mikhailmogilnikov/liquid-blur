/**
 * Liquid Blur for Vue: `<Glass>`, glass with its variants as props, and `<Glass.Group>`, glass that
 * melts between its children.
 *
 *   <Glass interactive tint="#0a84ff" as-child><button>Follow</button></Glass>
 *   <Glass.Group class="toolbar">
 *     <Glass>…</Glass>
 *     <Glass interactive as-child><button>…</button></Glass>
 *   </Glass.Group>
 *
 * The material is the stylesheet's (`@fluidkit/vue/style.css`, imported once): `<Glass>` is its
 * classes and custom properties, written for you. A press prop installs press on its document the
 * first time it's there, nothing to set up at the root; glass with press classes of your own takes
 * `usePress()`. A group is made once its root is in the page and let go of when it goes.
 */
import { defineComponent, onMounted, shallowRef, watchPostEffect, type PropType, type ShallowRef } from "vue";
import { attachRef, renderPart, type FunctionRef } from "./helpers";
import { createGlassGroup, installPress, type GlassGroup } from "@fluidkit/core";
import { groupStyle, presses, variants, type GlassVariants } from "@fluidkit/core/internal";

export type { GlassVariants };

/** Press installed on the document once mounted: the same install however many ask for it */
export function usePress() {
  onMounted(() => {
    installPress();
  });
}

/**
 * The class and custom properties for these variants, for glass that isn't `<Glass>`:
 * `v-bind="glass({ interactive: true })"`
 */
export function glass(given: GlassVariants = {}): { class: string; style: Record<string, string | number> } {
  const { classes, style } = variants(given);
  return { class: classes, style };
}

/** Glass: a `div`, or with `as-child` the element in its slot, its variants as props, your classes and styles kept */
const Root = defineComponent({
  name: "Glass",
  inheritAttrs: false,
  props: {
    /** Clear, for glass over photos and video (`lb-clear`) */
    clear: Boolean,
    /** Its fill is a color: this one, or `--lb-tint` as inherited (`lb-tinted`) */
    tint: { type: [Boolean, String] as PropType<boolean | string>, default: false },
    /** A lens: no blur (`lb-lens`) */
    lens: Boolean,
    /** 0 opaque, 0.5 the default, 1 clear (`--lb-transparency`) */
    transparency: Number,
    /** 0 flat, 0.5 the default, 1 pronounced (`--lb-depth`) */
    depth: Number,
    /** Highlight, swell and stretch (`lb-interactive`) */
    interactive: Boolean,
    /** Lights up where it's pressed (`lb-highlight`) */
    highlight: Boolean,
    /** Grows while it's pressed (`lb-swell`) */
    swell: Boolean,
    /** Stretches along the drag, along `x` or `y` alone if given (`lb-stretch`) */
    stretch: { type: [Boolean, String] as PropType<boolean | "x" | "y">, default: false },
    asChild: Boolean,
  },
  setup(props, { attrs, slots }) {
    const el = shallowRef<HTMLElement | null>(null);
    const own = attachRef((node) => {
      el.value = node;
      return () => {
        if (el.value === node) el.value = null;
      };
    });
    // Press on its own document, an iframe's too, the first time glass there needs it
    watchPostEffect(() => {
      if (el.value && presses(props)) installPress(el.value.ownerDocument);
    });
    return () => {
      const { classes, style } = variants(props);
      return renderPart(
        "div",
        { ...attrs, ref: own, class: [classes, attrs.class], style: [style, attrs.style] },
        props.asChild,
        slots,
        {},
      );
    };
  },
});

export type UseGlassGroup = {
  /** The ref for the group's root, written `lb lb-group`: `:ref="group.root"` */
  root: FunctionRef;
  /** The group, once its root is in the page: `update()` it after something it can't see moves a child */
  group: Readonly<ShallowRef<GlassGroup | null>>;
};

/** A glass group on a root of yours, made once it's in the page and let go of when it goes */
export function useGlassGroup(): UseGlassGroup {
  const group = shallowRef<GlassGroup | null>(null);
  const root = attachRef((el) => {
    const made = createGlassGroup(el);
    group.value = made;
    return () => {
      made.destroy();
      if (group.value === made) group.value = null;
    };
  });
  return { root, group };
}

/**
 * Glass that melts between its children where they come close: a `div`, or with `as-child` the
 * element in its slot, written `lb lb-group`. Its children are glass, `<Glass>` or `lb`
 */
const Group = defineComponent({
  name: "GlassGroup",
  inheritAttrs: false,
  props: {
    /** For all its glass: 0 opaque, 0.5 the default, 1 clear */
    transparency: Number,
    /** For all its glass: 0 flat, 0.5 the default, 1 pronounced */
    depth: Number,
    /** How close children come before they melt, px: 18 unless given (`--lb-merge`) */
    merge: Number,
    asChild: Boolean,
  },
  setup(props, { attrs, slots }) {
    const { root } = useGlassGroup();
    return () =>
      renderPart(
        "div",
        {
          ...attrs,
          ref: root,
          class: ["lb lb-group", attrs.class],
          style: [groupStyle(props.transparency, props.depth, props.merge), attrs.style],
        },
        props.asChild,
        slots,
        {},
      );
  },
});

/**
 * Glass, and `Glass.Group` for glass that melts. Typed by its parts: inferred, its declaration spells
 * out Vue's instance type, which `vue-tsc` rejects in an app that checks libraries
 */
export const Glass: typeof Root & { Group: typeof Group } = Object.assign(Root, { Group });

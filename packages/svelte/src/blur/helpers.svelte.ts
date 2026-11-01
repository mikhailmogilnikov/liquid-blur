import { onMount } from "svelte";
import type { Attachment } from "svelte/attachments";
import { createGlassGroup, installPress, type GlassGroup } from "@fluidkit/core";
import { variants, type GlassVariants } from "@fluidkit/core/internal";

/** Custom properties as a `style` attribute takes them */
export const cssText = (style: Record<string, string | number>) =>
  Object.entries(style)
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");

/** Press installed on the document once mounted: the same install however many ask for it */
export function usePress() {
  onMount(() => {
    installPress();
  });
}

/**
 * The class and custom properties for these variants, for glass that isn't `<Glass>`:
 * `<div {...glass({ interactive: true })}>`
 */
export function glass(given: GlassVariants = {}): { class: string; style: string } {
  const { classes, style } = variants(given);
  return { class: classes, style: cssText(style) };
}

export type UseGlassGroup = {
  /** For the group's root, written `lb lb-group`: `{@attach group.root}` */
  root: Attachment;
  /** The group, once its root is in the page: `update()` it after something it can't see moves a child */
  readonly group: GlassGroup | null;
};

/** A glass group on a root of yours, made once it's in the page and let go of when it goes */
export function useGlassGroup(): UseGlassGroup {
  let group = $state.raw<GlassGroup | null>(null);
  return {
    root: (node) => {
      const made = createGlassGroup(node as HTMLElement);
      group = made;
      return () => {
        made.destroy();
        if (group === made) group = null;
      };
    },
    get group() {
      return group;
    },
  };
}

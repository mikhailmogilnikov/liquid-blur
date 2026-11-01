import { getContext, setContext } from "svelte";
import type { UseLayout } from "./use-layout.svelte.js";

/** What the root's `child` snippet gets besides its props */
export type LayoutState = { moving: boolean };

const key = Symbol("fluidkit-layout");

export const setLayoutContext = (layout: UseLayout) => setContext(key, layout);

/** The layout inside `<Layout.Root>`: for a part of your own */
export function useLayoutParts(): UseLayout {
  const context = getContext<UseLayout | undefined>(key);
  if (!context) throw new Error("useLayoutParts() has to be inside <Layout.Root>");
  return context;
}

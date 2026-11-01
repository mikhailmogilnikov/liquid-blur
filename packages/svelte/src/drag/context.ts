import { getContext, setContext } from "svelte";
import type { UseDrag } from "./use-drag.svelte.js";

/** What a part's `child` snippet gets besides its props */
export type DragState = { snap: number; dragging: boolean };

const key = Symbol("fluidkit-drag");

export const setDragContext = (drag: UseDrag) => setContext(key, drag);

export function getDragContext(part: string): UseDrag {
  const context = getContext<UseDrag | undefined>(key);
  if (!context) throw new Error(`Drag.${part} has to be inside <Drag.Root>`);
  return context;
}

/** The drag's state and attachments inside `<Drag.Root>`: for a part of your own */
export const useDragParts = () => getDragContext("parts");

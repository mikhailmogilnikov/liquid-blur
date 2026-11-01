import { getContext, setContext } from "svelte";
import type { UseIndicator } from "./use-indicator.svelte.js";

/** What the root's `child` snippet gets besides its props */
export type IndicatorRootState = { value: string | null; active: string | null };
/** What an item's `child` snippet gets besides its props */
export type IndicatorItemState = { selected: boolean; active: boolean };

const key = Symbol("fluidkit-indicator");

export const setIndicatorContext = (indicator: UseIndicator) => setContext(key, indicator);

export function getIndicatorContext(part: string): UseIndicator {
  const context = getContext<UseIndicator | undefined>(key);
  if (!context) throw new Error(`Indicator.${part} has to be inside <Indicator.Root>`);
  return context;
}

/** The indicator's state and attachments inside `<Indicator.Root>`: for a part of your own */
export const useIndicatorParts = () => getIndicatorContext("parts");

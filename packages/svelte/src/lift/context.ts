import { getContext, setContext } from "svelte";
import type { UseLift } from "./use-lift.svelte.js";

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

/** What a part's `child` snippet gets besides its props */
export type LiftState = { opened: boolean };

export type LiftContext = {
  lift: UseLift;
  /** Each item's own `onSelect`, by its element */
  handlers: Map<HTMLElement, (event: LiftSelectEvent) => void>;
};

const key = Symbol("fluidkit-lift");

export const setLiftContext = (context: LiftContext) => setContext(key, context);

export function getLiftContext(part: string): LiftContext {
  const context = getContext<LiftContext | undefined>(key);
  if (!context) throw new Error(`Lift.${part} has to be inside <Lift.Root>`);
  return context;
}

/** The lift's state and attachments inside `<Lift.Root>`: for a part of your own */
export const useLiftParts = () => getLiftContext("parts").lift;

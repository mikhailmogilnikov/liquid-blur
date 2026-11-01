import { getContext, setContext } from "svelte";
import type { UseMorph } from "./use-morph.svelte.js";

/** What a state's `child` snippet gets besides its props */
export type MorphStateState = { current: boolean; moving: boolean };

const key = Symbol("fluidkit-morph");

export const setMorphContext = (morph: UseMorph) => setContext(key, morph);

export function getMorphContext(part: string): UseMorph {
  const context = getContext<UseMorph | undefined>(key);
  if (!context) throw new Error(`Morph.${part} has to be inside <Morph.Root>`);
  return context;
}

/** The morph's state and attachments inside `<Morph.Root>`: for a part of your own */
export const useMorphParts = () => getMorphContext("parts");

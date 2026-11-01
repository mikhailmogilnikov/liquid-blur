/**
 * Morph for Svelte: `<Morph.Root>` and its parts by default, `useMorph()` for markup of your own.
 *
 *   <Morph.Root bind:value={shown}>
 *     <Morph.State value="button" class="lb">
 *       <Morph.Trigger value="panel">More</Morph.Trigger>
 *     </Morph.State>
 *     <Morph.State value="panel" class="lb panel">
 *       <Morph.Trigger value="button">Close</Morph.Trigger>
 *     </Morph.State>
 *   </Morph.Root>
 *
 * States are known by their `value`. `value` is the one asked for, as the engine's `current`: it
 * changes at once, and the shape flows there once it's rendered. The morph is made once a state is in
 * the page and given new props with `set()`, never made again for them; a state that comes later is
 * added to it, one that goes is let go of. The one it's at going makes it again, from the others.
 */
import Match from "./Match.svelte";
import Root from "./Root.svelte";
import State from "./State.svelte";
import Trigger from "./Trigger.svelte";

export { useMorph, type UseMorph, type UseMorphOptions } from "./use-morph.svelte.js";
export { useMorphParts, type MorphStateState } from "./context.js";

/** Morph's parts: `Root`, `State`, `Trigger`, `Match` */
export const Morph = { Root, State, Trigger, Match };

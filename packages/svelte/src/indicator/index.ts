/**
 * Indicator for Svelte: `<Indicator.Root>` and its parts by default, `useIndicator()` for markup of
 * your own.
 *
 *   <Indicator.Root bind:value={tab} trigger="press">
 *     <Indicator.Thumb class="thumb" />
 *     <Indicator.Item value="overview">Overview</Indicator.Item>
 *     <Indicator.Item value="releases">Releases</Indicator.Item>
 *   </Indicator.Root>
 *
 * Items are known by their `value`. `value` is the one chosen, where the indicator rests: a click
 * on an item chooses it (a press dragged across and let go on one, too). `active` is one pointed at
 * by something else, the finger on a lift's menu, say, followed as it changes.
 */
import Item from "./Item.svelte";
import Root from "./Root.svelte";
import Thumb from "./Thumb.svelte";

export { useIndicator, type UseIndicator, type UseIndicatorOptions } from "./use-indicator.svelte.js";
export { useIndicatorParts, type IndicatorItemState, type IndicatorRootState } from "./context.js";

/** Indicator's parts: `Root`, `Thumb`, `Item` */
export const Indicator = { Root, Thumb, Item };

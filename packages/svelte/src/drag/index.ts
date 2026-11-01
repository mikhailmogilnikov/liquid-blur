/**
 * Drag for Svelte: `<Drag.Root>` and its parts by default, `useDrag()` for markup of your own.
 *
 *   <Drag.Root bind:snap axis="y" snaps={({ height }) => [0, height / 2, height - 76]}>
 *     <Drag.Handle class="grabber" />
 *     <Drag.Scroll>
 *       {#snippet child({ props })}<ul {...props}>…</ul>{/snippet}
 *     </Drag.Scroll>
 *   </Drag.Root>
 *
 * The root is what moves. Snap points and bounds can be functions of the room it's in (its parent's
 * size): read again on a resize, and after an update that changes what they give. `snap` is the snap
 * point it's at or heads for, and changes as it's let go. The drag is made once its element is in the
 * page and given new props with `set()`, never made again for them; a new element, handle or scroll
 * area, or another axis, makes it again where it was.
 */
import Handle from "./Handle.svelte";
import Root from "./Root.svelte";
import Scroll from "./Scroll.svelte";

export { useDrag, type DragArea, type Given, type UseDrag, type UseDragOptions } from "./use-drag.svelte.js";
export { useDragParts, type DragState } from "./context.js";

/** Drag's parts: `Root`, `Handle`, `Scroll` */
export const Drag = { Root, Handle, Scroll };

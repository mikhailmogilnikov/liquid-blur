/**
 * Lift for Svelte: `<Lift.Root>` and its parts by default, `useLift()` for markup of your own.
 *
 *   <Lift.Root onSelect={(value) => act(value)}>
 *     <Lift.Target>
 *       {#snippet child({ props })}<img {...props} src={src} alt="" />{/snippet}
 *     </Lift.Target>
 *     <Lift.Menu class="menu">
 *       <Lift.Item value="copy">Copy</Lift.Item>
 *       <Lift.Item value="share">Share</Lift.Item>
 *     </Lift.Menu>
 *   </Lift.Root>
 *
 * The lift is made once its target is in the page and given new props with `set()`, never made
 * again for them; a new target or menu element makes it again. Its menu and preview are moved into
 * the lift's dialog while it's open: each sits in a box of its own that stays where Svelte put it.
 */
import Item from "./Item.svelte";
import Menu from "./Menu.svelte";
import Preview from "./Preview.svelte";
import Root from "./Root.svelte";
import Separator from "./Separator.svelte";
import Target from "./Target.svelte";

export { useLift, type UseLift, type UseLiftOptions } from "./use-lift.svelte.js";
export { useLiftParts, type LiftSelectEvent, type LiftState } from "./context.js";

/** Lift's parts: `Root`, `Target`, `Menu`, `Item`, `Separator`, `Preview` */
export const Lift = { Root, Target, Menu, Item, Separator, Preview };

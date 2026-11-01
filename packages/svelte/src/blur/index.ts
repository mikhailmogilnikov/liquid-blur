/**
 * Liquid Blur for Svelte: `<Glass>`, glass with its variants as props, and `<Glass.Group>`, glass that
 * melts between its children.
 *
 *   <Glass interactive tint="#0a84ff">
 *     {#snippet child({ props })}<button {...props}>Follow</button>{/snippet}
 *   </Glass>
 *   <Glass.Group class="toolbar">
 *     <Glass>…</Glass>
 *   </Glass.Group>
 *
 * The material is the stylesheet's (`@fluidkit/svelte/style.css`, imported once): `<Glass>` is its
 * classes and custom properties, written for you. A press prop installs press on its document the
 * first time it's there, nothing to set up at the root; glass with press classes of your own takes
 * `usePress()`. A group is made once its root is in the page and let go of when it goes.
 */
import Group from "./Group.svelte";
import Root from "./Glass.svelte";

export type { GlassVariants } from "@fluidkit/core/internal";
export { glass, useGlassGroup, usePress, type UseGlassGroup } from "./helpers.svelte.js";

/** Glass, and `Glass.Group` for glass that melts */
export const Glass = Object.assign(Root, { Group });

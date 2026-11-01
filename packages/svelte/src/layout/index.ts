/**
 * Layout for Svelte: `<Layout.Root>` by default, `useLayout()` for markup of your own.
 *
 *   <Layout.Root>
 *     {#snippet child({ props })}
 *       <ul {...props}>{#each todos as todo (todo.id)}<li>{todo.text}</li>{/each}</ul>
 *     {/snippet}
 *   </Layout.Root>
 *
 * Its items are its children (or what `items` selects in it): rows Svelte puts in, takes out or
 * moves by their keys, classes it changes, sizes that change, all followed as the page changes
 * them. The layout is made once its root is in the page and given new props with `set()`, never
 * made again for them; another root or `items` makes it again.
 */
import Root from "./Root.svelte";

export { useLayout, type UseLayout, type UseLayoutOptions } from "./use-layout.svelte.js";
export { useLayoutParts, type LayoutState } from "./context.js";

/** Layout's part: `Root` */
export const Layout = { Root };

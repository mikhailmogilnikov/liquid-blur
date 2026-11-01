<!--
  @component
  The root whose items move: a `div`, or with a `child` snippet an element of yours, its children the
  items. Marked `data-moving` while something is on its way.

    <Layout.Root>
      {#snippet child({ props })}
        <ul {...props}>{#each todos as todo (todo.id)}<li>{todo.text}</li>{/each}</ul>
      {/snippet}
    </Layout.Root>
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import type { SpringParams, TransitionParams } from "@fluidkit/core";
  import { flag, mergeProps, type PartProps } from "../helpers/index.js";
  import { setLayoutContext, type LayoutState } from "./context.js";
  import { useLayout } from "./use-layout.svelte.js";

  type Props = PartProps<LayoutState> & {
    /** Its items, as a selector inside it: its children unless given */
    items?: string;
    /** The spring everything moves on */
    spring?: SpringParams;
    /** Sizes change on the spring too (the default); `false`, at once, and only positions move */
    size?: boolean;
    /** How a new item comes in: `transitions.scale()` unless given; `false`, it's there at once */
    enter?: TransitionParams | false;
    /** How an item taken out goes: `transitions.scale()` unless given; `false`, it's gone at once */
    exit?: TransitionParams | false;
    /** Something set off moving, from rest */
    onStart?: () => void;
    /** Everything has come to rest */
    onRest?: () => void;
  };

  let { items, spring, size, enter, exit, onStart, onRest, child, children, ...rest }: Props = $props();

  const layout = useLayout(() => ({
    items,
    spring,
    size,
    enter,
    exit,
    onStart: () => onStart?.(),
    onRest: () => onRest?.(),
  }));
  setLayoutContext(layout);

  const attach = createAttachmentKey();
  const merged = $derived(mergeProps(rest, { [attach]: layout.root, "data-moving": flag(layout.moving) }));
</script>

{#if child}
  {@render child({ props: merged, moving: layout.moving })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

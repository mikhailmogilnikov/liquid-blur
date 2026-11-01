<!--
  @component
  What's grabbed, such as a sheet's grabber: a `div`, or with a `child` snippet an element of yours.
  Without one, the root is.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getDragContext, type DragState } from "./context.js";

  let { child, children, ...rest }: PartProps<DragState> = $props();

  const drag = getDragContext("Handle");
  const attach = createAttachmentKey();
  const merged = $derived(mergeProps(rest, { [attach]: drag.handle }));
</script>

{#if child}
  {@render child({ props: merged, snap: drag.snap, dragging: drag.dragging })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

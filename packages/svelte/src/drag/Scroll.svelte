<!--
  @component
  An area inside that scrolls along its axis, such as a sheet's list: a finger hands one gesture
  between the two, as iOS sheets do. A `div`, or with a `child` snippet an element of yours.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getDragContext, type DragState } from "./context.js";

  let { child, children, ...rest }: PartProps<DragState> = $props();

  const drag = getDragContext("Scroll");
  const attach = createAttachmentKey();
  const merged = $derived(mergeProps(rest, { [attach]: drag.scroll }));
</script>

{#if child}
  {@render child({ props: merged, snap: drag.snap, dragging: drag.dragging })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

<!--
  @component
  Lifted instead of a copy: something live, or a bigger preview, at its own size. Out of sight until
  it's lifted, in a box of its own that stays where Svelte put it.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getLiftContext, type LiftState } from "./context.js";

  let { child, children, ...rest }: PartProps<LiftState> = $props();

  const { lift } = getLiftContext("Preview");
  const attach = createAttachmentKey();
  const merged = $derived(mergeProps(rest, { [attach]: lift.preview }));
</script>

<div style="display: none">
  {#if child}
    {@render child({ props: merged, opened: lift.opened })}
  {:else}
    <div {...merged}>{@render children?.()}</div>
  {/if}
</div>

<!--
  @component
  The one element that flies onto the items: a `span`, under them.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getIndicatorContext } from "./context.js";

  let { child, children, ...rest }: PartProps = $props();

  const indicator = getIndicatorContext("Thumb");
  const attach = createAttachmentKey();
  const merged = $derived(
    mergeProps({ "aria-hidden": "true", style: "position: absolute; z-index: -1" }, rest, {
      [attach]: indicator.indicator,
    }),
  );
</script>

{#if child}
  {@render child({ props: merged })}
{:else}
  <span {...merged}>{@render children?.()}</span>
{/if}

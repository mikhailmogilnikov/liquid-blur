<!--
  @component
  What's held and lifted: a `div`, or with a `child` snippet an element of yours.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getLiftContext, type LiftState } from "./context.js";

  let { child, children, ...rest }: PartProps<LiftState> = $props();

  const { lift } = getLiftContext("Target");
  const attach = createAttachmentKey();
  const merged = $derived(
    mergeProps(rest, { [attach]: lift.element, "data-state": lift.opened ? "open" : "closed" }),
  );
</script>

{#if child}
  {@render child({ props: merged, opened: lift.opened })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

<!--
  @component
  The menu, opened beside it; hidden until then. Its items are `Lift.Item`s. It sits in a box of its
  own (`display: contents`) that stays where Svelte put it while the menu is in the lift's dialog.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getLiftContext, type LiftState } from "./context.js";

  let { child, children, ...rest }: PartProps<LiftState> = $props();

  const { lift } = getLiftContext("Menu");
  const attach = createAttachmentKey();
  const merged = $derived(
    mergeProps({ role: "menu", hidden: true }, rest, {
      [attach]: lift.menu,
      "data-state": lift.opened ? "open" : "closed",
    }),
  );
</script>

<div style="display: contents">
  {#if child}
    {@render child({ props: merged, opened: lift.opened })}
  {:else}
    <div {...merged}>{@render children?.()}</div>
  {/if}
</div>

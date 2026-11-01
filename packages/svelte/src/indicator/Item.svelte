<!--
  @component
  An item: a `button`, or with a `child` snippet an element of yours; chosen by a click.
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { createAttachmentKey } from "svelte/attachments";
  import { flag, mergeProps, type PartProps } from "../helpers/index.js";
  import { getIndicatorContext, type IndicatorItemState } from "./context.js";

  type Props = Omit<PartProps<IndicatorItemState, HTMLButtonAttributes>, "value"> & {
    /** What it's known by: what the root's `value` says */
    value: string;
  };

  let { value, child, children, ...rest }: Props = $props();

  const indicator = getIndicatorContext("Item");
  const attach = createAttachmentKey();
  const selected = $derived(indicator.value === value);
  const active = $derived(indicator.active === value);
  const merged = $derived(
    mergeProps({ type: "button" }, rest, {
      [attach]: indicator.item(value),
      "data-selected": flag(selected),
      "data-active": flag(active),
    }),
  );
</script>

{#if child}
  {@render child({ props: merged, selected, active })}
{:else}
  <button {...merged}>{@render children?.()}</button>
{/if}

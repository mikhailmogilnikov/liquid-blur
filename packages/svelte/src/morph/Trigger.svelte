<!--
  @component
  Sends the morph to a state when it's clicked: a `button`, or with a `child` snippet an element of
  yours. Your own `onclick` runs first: `preventDefault()` in it keeps the morph where it is.
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { getMorphContext } from "./context.js";

  type Props = Omit<PartProps<{ current: boolean }, HTMLButtonAttributes>, "value"> & {
    /** The state it sends the morph to */
    value: string;
    /** There at once, as with reduced motion */
    instant?: boolean;
  };

  let { value, instant = false, child, children, ...rest }: Props = $props();

  const morph = getMorphContext("Trigger");
  const onclick = (event: MouseEvent) => {
    if (!event.defaultPrevented) void morph.to(value, instant ? { instant: true } : undefined);
  };
  const merged = $derived(mergeProps({ type: "button" }, rest, { onclick }));
</script>

{#if child}
  {@render child({ props: merged, current: morph.value === value })}
{:else}
  <button {...merged}>{@render children?.()}</button>
{/if}

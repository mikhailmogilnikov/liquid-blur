<!--
  @component
  A piece that flies from one state into the other, to its match of the same `name`: a `span`, or
  with a `child` snippet an element of yours.
-->
<script lang="ts">
  import { mergeProps, type PartProps } from "../helpers/index.js";

  type Props = PartProps & {
    /** Flies to the match of the same name in the other state; none without one */
    name?: string;
  };

  let { name, child, children, ...rest }: Props = $props();

  const merged = $derived(mergeProps(rest, { "data-fk-match": name }));
</script>

{#if child}
  {@render child({ props: merged })}
{:else}
  <span {...merged}>{@render children?.()}</span>
{/if}

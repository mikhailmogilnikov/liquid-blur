<!--
  @component
  A state: laid out where and as it is at rest, a `div`, or with a `child` snippet an element of yours.
  Marked `data-current` while it's the one asked for. Keep its hiding (`visibility: hidden`) in CSS,
  not in `style`: away, a state's inline opacity and visibility are the morph's.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { flag, mergeProps, type PartProps } from "../helpers/index.js";
  import { getMorphContext, type MorphStateState } from "./context.js";

  type Props = PartProps<MorphStateState> & {
    /** What it's known by: what the root's `value` says */
    value: string;
  };

  let { value, child, children, ...rest }: Props = $props();

  const morph = getMorphContext("State");
  const attach = createAttachmentKey();
  const current = $derived(morph.value === value);
  const merged = $derived(mergeProps(rest, { [attach]: morph.state(value), "data-current": flag(current) }));
</script>

{#if child}
  {@render child({ props: merged, current, moving: morph.moving })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

<!--
  @component
  Glass that melts between its children where they come close: a `div`, or with a `child` snippet an
  element of yours, written `lb lb-group`. Its children are glass, `<Glass>` or `lb`.
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { groupStyle } from "@fluidkit/core/internal";
  import { cssText, useGlassGroup } from "./helpers.svelte.js";

  type Props = PartProps & {
    /** For all its glass: 0 opaque, 0.5 the default, 1 clear */
    transparency?: number;
    /** For all its glass: 0 flat, 0.5 the default, 1 pronounced */
    depth?: number;
    /** How close children come before they melt, px: 18 unless given (`--lb-merge`) */
    merge?: number;
  };

  let { transparency, depth, merge, child, children, ...rest }: Props = $props();

  const group = useGlassGroup();
  const attach = createAttachmentKey();
  const merged = $derived(
    mergeProps(
      { class: "lb lb-group", style: cssText(groupStyle(transparency, depth, merge)) || undefined },
      rest,
      { [attach]: group.root },
    ),
  );
</script>

{#if child}
  {@render child({ props: merged })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

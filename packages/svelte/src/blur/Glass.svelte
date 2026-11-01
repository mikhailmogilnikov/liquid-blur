<!--
  @component
  Glass: a `div`, or with a `child` snippet an element of yours, its variants as props, your classes
  and styles kept. A press prop installs press on its document the first time it's there.

    <Glass interactive tint="#0a84ff">
      {#snippet child({ props })}<button {...props}>Follow</button>{/snippet}
    </Glass>
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { installPress } from "@fluidkit/core";
  import { presses, variants, type GlassVariants } from "@fluidkit/core/internal";
  import { cssText } from "./helpers.svelte.js";

  type Props = PartProps & GlassVariants;

  let {
    clear,
    tint = false,
    lens,
    transparency,
    depth,
    interactive,
    highlight,
    swell,
    stretch = false,
    child,
    children,
    ...rest
  }: Props = $props();

  const given = $derived({ clear, tint, lens, transparency, depth, interactive, highlight, swell, stretch });
  const attach = createAttachmentKey();
  // Press on its own document, an iframe's too, the first time glass there needs it
  const press = (node: Element) => {
    if (presses(given)) installPress(node.ownerDocument);
  };
  const merged = $derived.by(() => {
    const { classes, style } = variants(given);
    return mergeProps({ class: classes, style: cssText(style) || undefined }, rest, { [attach]: press });
  });
</script>

{#if child}
  {@render child({ props: merged })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

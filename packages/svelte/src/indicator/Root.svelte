<!--
  @component
  The container of its items and its indicator: a `div`, or with a `child` snippet an element of yours.

    <Indicator.Root bind:value={tab} trigger="press">
      <Indicator.Thumb class="thumb" />
      <Indicator.Item value="overview">Overview</Indicator.Item>
    </Indicator.Root>
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import type { IndicatorSprings, IndicatorTrigger } from "@fluidkit/core";
  import { setIndicatorContext, type IndicatorRootState } from "./context.js";
  import { useIndicator } from "./use-indicator.svelte.js";

  type Props = PartProps<IndicatorRootState> & {
    /** The item chosen, where it rests: controlled, with `bind:value`. Without it, the choice is its own */
    value?: string | null;
    /** Chosen at first, when the choice is its own */
    defaultValue?: string | null;
    /** An item pointed at by something else, followed; `null`, back to rest */
    active?: string | null;
    /** What moves it: `auto` (hover for a mouse, press for a finger) unless given */
    trigger?: IndicatorTrigger;
    /** With press, an item it's released over is clicked; on unless `false` */
    click?: boolean;
    /** Keyboard focus that shows moves it; on unless `false` or manual */
    focus?: boolean;
    /** Springs for `x`, `y`, `width`, `height` and `presence` */
    spring?: Partial<IndicatorSprings>;
    /** An item chosen: by a click, or a press let go on it */
    onValueChange?: (value: string) => void;
    /** The item it's on changed, whatever put it there, or `null` gone */
    onActiveChange?: (value: string | null) => void;
  };

  let {
    value = $bindable(),
    defaultValue = null,
    active,
    trigger,
    click,
    focus,
    spring,
    onValueChange,
    onActiveChange,
    child,
    children,
    ...rest
  }: Props = $props();

  const indicator = useIndicator(() => ({
    value,
    defaultValue,
    active,
    trigger,
    click,
    focus,
    spring,
    onValueChange: (next) => {
      value = next;
      onValueChange?.(next);
    },
    onActiveChange: (next) => onActiveChange?.(next),
  }));
  setIndicatorContext(indicator);

  const attach = createAttachmentKey();
  const merged = $derived(mergeProps({ style: "position: relative" }, rest, { [attach]: indicator.container }));
</script>

{#if child}
  {@render child({ props: merged, value: indicator.value, active: indicator.active })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

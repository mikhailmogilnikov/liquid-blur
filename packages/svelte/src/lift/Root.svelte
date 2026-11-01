<!--
  @component
  The lift: its props and state, for the parts inside it. Renders nothing of its own.

    <Lift.Root bind:open onSelect={(value) => act(value)}>
      <Lift.Target>…</Lift.Target>
      <Lift.Menu>
        <Lift.Item value="copy">Copy</Lift.Item>
      </Lift.Menu>
    </Lift.Root>
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SpringParams } from "@fluidkit/core";
  import { setLiftContext, type LiftSelectEvent } from "./context.js";
  import { useLift } from "./use-lift.svelte.js";

  type Props = {
    /** Lifted while `true`: controlled, with `bind:open`. Without it, it's its own */
    open?: boolean;
    /** Lifted at first, when it's its own */
    defaultOpen?: boolean;
    /** How long a press is held, ms: 500 by default */
    delay?: number;
    /** How much bigger it's lifted: 1.04 by default */
    scale?: number;
    /** How dark the page goes behind it, 0 to 1: 0.2 by default */
    dim?: number;
    /** How blurred the page goes behind it, px: 12 by default */
    blur?: number;
    /** Where the menu goes: by the room there unless given */
    placement?: "auto" | "below" | "above";
    /** The spring it rises on */
    spring?: SpringParams;
    /** What counts as an item in the menu, as a selector */
    items?: string;
    /** Opened or closed */
    onOpenChange?: (open: boolean) => void;
    /** An item chosen: its `value` and element. The menu closes after, unless its own `onSelect` prevented it */
    onSelect?: (value: string, item: HTMLElement) => void;
    /** The finger that lifted it is over this item, or `null` off them */
    onHighlight?: (item: HTMLElement | null) => void;
    children?: Snippet;
  };

  let {
    open = $bindable(),
    defaultOpen = false,
    delay,
    scale,
    dim,
    blur,
    placement,
    spring,
    items,
    onOpenChange,
    onSelect,
    onHighlight,
    children,
  }: Props = $props();

  const handlers = new Map<HTMLElement, (event: LiftSelectEvent) => void>();

  const lift = useLift(() => ({
    open,
    defaultOpen,
    delay,
    scale,
    dim,
    blur,
    placement,
    spring,
    items,
    onOpenChange: (next) => {
      open = next;
      onOpenChange?.(next);
    },
    onHighlight: (item) => onHighlight?.(item),
    onSelect: (item) => {
      let prevented = false;
      const event: LiftSelectEvent = {
        value: item.dataset.value ?? "",
        item,
        preventDefault: () => {
          prevented = true;
        },
        get defaultPrevented() {
          return prevented;
        },
      };
      handlers.get(item)?.(event);
      onSelect?.(event.value, item);
      return prevented ? false : undefined;
    },
  }));

  setLiftContext({ lift, handlers });
</script>

{@render children?.()}

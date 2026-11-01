<!--
  @component
  An item of the menu: a `button`, or with a `child` snippet an element of yours.
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { createAttachmentKey } from "svelte/attachments";
  import { flag, mergeProps, type PartProps } from "../helpers/index.js";
  import { getLiftContext, type LiftSelectEvent } from "./context.js";

  type Props = Omit<PartProps<{ disabled: boolean }, HTMLButtonAttributes>, "onselect" | "value"> & {
    /** What `onSelect` on the root is given for it */
    value?: string;
    /** Not chosen, by anything; passed over by the arrow keys */
    disabled?: boolean;
    /** Chosen: before the root hears of it. `event.preventDefault()` keeps the menu open */
    onSelect?: (event: LiftSelectEvent) => void;
  };

  let { value, disabled = false, onSelect, child, children, ...rest }: Props = $props();

  const { handlers } = getLiftContext("Item");
  const attach = createAttachmentKey();
  // Its own `onSelect`, as it is when chosen
  const register = (node: Element) => {
    const el = node as HTMLElement;
    handlers.set(el, (event) => onSelect?.(event));
    return () => {
      handlers.delete(el);
    };
  };
  const merged = $derived(
    mergeProps({ type: "button", role: "menuitem" }, rest, {
      [attach]: register,
      "data-value": value,
      "aria-disabled": disabled || undefined,
      "data-disabled": flag(disabled),
    }),
  );
</script>

{#if child}
  {@render child({ props: merged, disabled })}
{:else}
  <button {...merged}>{@render children?.()}</button>
{/if}

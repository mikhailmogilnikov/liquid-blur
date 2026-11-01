<!--
  @component
  The morph: its props and state, for the states and triggers inside it. Renders nothing of its own.

    <Morph.Root bind:value={shown}>
      <Morph.State value="button">…</Morph.State>
      <Morph.State value="panel" class="lb panel">…</Morph.State>
    </Morph.Root>
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { MorphSettings } from "@fluidkit/core";
  import { setMorphContext } from "./context.js";
  import { useMorph } from "./use-morph.svelte.js";

  type Props = {
    /** The state asked for: controlled, with `bind:value`. Without it, it's its own */
    value?: string;
    /** The state shown at first, when it's its own; the first one in the page unless given */
    defaultValue?: string;
    /** Springs growing into a bigger box and shrinking into a smaller one */
    spring?: MorphSettings["spring"];
    /** Where the shape goes instead of next to the state it sets off from */
    container?: HTMLElement | null;
    /** A state asked for */
    onValueChange?: (value: string) => void;
    /** A flight set off */
    onStart?: (to: string, from: string) => void;
    /** It came to rest as a state */
    onRest?: (at: string) => void;
    /** Every frame of a flight */
    onProgress?: (progress: number, to: string, from: string | null) => void;
    children?: Snippet;
  };

  let {
    value = $bindable(),
    defaultValue,
    spring,
    container,
    onValueChange,
    onStart,
    onRest,
    onProgress,
    children,
  }: Props = $props();

  const morph = useMorph(() => ({
    value,
    defaultValue,
    spring,
    container,
    onValueChange: (next) => {
      value = next;
      onValueChange?.(next);
    },
    onStart: (to, from) => onStart?.(to, from),
    onRest: (at) => onRest?.(at),
    onProgress: (progress, to, from) => onProgress?.(progress, to, from),
  }));
  setMorphContext(morph);
</script>

{@render children?.()}

<script lang="ts">
  import { Drag, type DragArea } from "../../../src/drag/index.js";

  let {
    snap = $bindable(),
    defaultSnap,
    peek = 76,
    disabled = false,
    onSnapChange,
  }: { snap?: number; defaultSnap?: number; peek?: number; disabled?: boolean; onSnapChange?: (s: number) => void } =
    $props();
</script>

<div>
  <Drag.Root
    bind:snap
    {defaultSnap}
    {disabled}
    {onSnapChange}
    axis="y"
    snaps={({ height }: DragArea) => (peek === 76 ? [0, height / 2, height - peek] : [0, height - peek])}
    data-testid="sheet"
  >
    <Drag.Handle data-testid="grabber" />
    <Drag.Scroll data-testid="list" />
  </Drag.Root>
</div>

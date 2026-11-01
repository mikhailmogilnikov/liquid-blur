<script lang="ts">
  import { Drag, type DragArea } from "../../../src/drag/index.js";

  // The parent keeps `snap` at 1, hearing every change asked for
  let { changes }: { changes: number[] } = $props();
</script>

<div>
  <Drag.Root
    bind:snap={() => 1, (s) => changes.push(s)}
    axis="y"
    snaps={({ height }: DragArea) => [0, height / 2, height - 76]}
    data-testid="sheet"
  >
    <Drag.Handle data-testid="grabber" />
  </Drag.Root>
</div>

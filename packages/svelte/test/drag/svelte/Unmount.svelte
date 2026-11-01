<script lang="ts">
  import { useDrag } from "../../../src/drag/index.js";

  let { on }: { on: boolean } = $props();

  const drag = useDrag(() => ({
    snaps: [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ],
    defaultSnap: 1,
  }));
</script>

<div>
  {#if on}<div {@attach drag.element} data-testid="el"></div>{/if}
</div>

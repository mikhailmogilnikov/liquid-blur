<script lang="ts">
  import { useDrag } from "../../../src/drag/index.js";

  let { axis, duration, engines }: { axis: "x" | "y"; duration: number; engines: Set<unknown> } = $props();

  const drag = useDrag(() => ({ axis, snaps: [0, 100], defaultSnap: 1, spring: { duration, bounce: 0 } }));
  $effect(() => {
    if (drag.drag) engines.add(drag.drag);
  });
</script>

<div><div {@attach drag.element} data-testid="el"></div></div>

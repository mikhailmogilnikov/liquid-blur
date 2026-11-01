<script lang="ts">
  import { useIndicator } from "../../../src/indicator/index.js";

  let { trigger, engines }: { trigger: "manual" | "hover"; engines: Set<unknown> } = $props();

  const ind = useIndicator(() => ({ trigger }));
  $effect(() => {
    if (ind.engine) engines.add(ind.engine);
  });
</script>

<div {@attach ind.container}>
  <span {@attach ind.indicator}></span>
  <button {@attach ind.item("a")} data-x="0">A</button>
  <button {@attach ind.item("b")} data-x="100">B</button>
</div>

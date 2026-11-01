<script lang="ts">
  import { useMorph } from "../../../src/morph/index.js";

  let { duration, engines }: { duration: number; engines: Set<unknown> } = $props();

  const morph = useMorph(() => ({ spring: { grow: { x: { duration, bounce: 0 } } } }));
  $effect(() => {
    if (morph.morph) engines.add(morph.morph);
  });
</script>

<div>
  <div {@attach morph.state("a")}>A</div>
  <div {@attach morph.state("b")}>B</div>
</div>

<script lang="ts">
  import { Morph } from "../../../src/morph/index.js";

  let { dot }: { dot: boolean } = $props();
</script>

<Morph.Root>
  {#if dot}<Morph.State value="dot" data-testid="dot" />{/if}
  <Morph.State value="bar" data-testid="bar" />
</Morph.Root>

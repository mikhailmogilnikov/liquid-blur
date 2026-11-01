<script lang="ts">
  import { Morph } from "../../../src/morph/index.js";

  let { items }: { items: string[] } = $props();
</script>

<Morph.Root>
  <Morph.State value="dot" data-testid="dot" />
  {#each items as item (item)}
    <Morph.State value={item} data-testid={item} />
  {/each}
</Morph.Root>

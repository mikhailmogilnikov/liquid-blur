<script lang="ts">
  import { Morph } from "../../../src/morph/index.js";

  let { seen }: { seen: { text: string } } = $props();
  let sort = $state("Newest");
</script>

<Morph.Root defaultValue="panel" onStart={() => (seen.text = document.getElementById("pill")!.textContent!)}>
  <Morph.State value="pill" id="pill">{sort}</Morph.State>
  <Morph.State value="panel">
    <Morph.Trigger value="pill" onclick={() => (sort = "Oldest")}>Oldest</Morph.Trigger>
  </Morph.State>
</Morph.Root>

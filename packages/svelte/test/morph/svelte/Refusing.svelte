<script lang="ts">
  import { Morph } from "../../../src/morph/index.js";

  // The parent holds the state and says no to every change asked for
  let { state }: { state: string } = $props();
</script>

<Morph.Root bind:value={() => state, () => {}}>
  <Morph.State value="button" data-testid="button"><Morph.Trigger value="panel">More</Morph.Trigger></Morph.State>
  <Morph.State value="panel" data-testid="panel"><Morph.Trigger value="button">Close</Morph.Trigger></Morph.State>
</Morph.Root>

<script lang="ts">
  import { Morph } from "../../../src/morph/index.js";

  let {
    value = $bindable(),
    defaultValue,
    onValueChange,
    onRest,
  }: { value?: string; defaultValue?: string; onValueChange?: (v: string) => void; onRest?: (at: string) => void } =
    $props();
</script>

<div>
  <Morph.Root bind:value {defaultValue} {onValueChange} {onRest}>
    <!-- The state is the trigger: its props spread onto the trigger, which puts them on its button -->
    <Morph.State value="button" data-testid="button">
      {#snippet child({ props })}<Morph.Trigger {...props} value="panel">More</Morph.Trigger>{/snippet}
    </Morph.State>
    <Morph.State value="panel" data-testid="panel">
      <Morph.Trigger value="button">Close</Morph.Trigger>
    </Morph.State>
  </Morph.Root>
</div>

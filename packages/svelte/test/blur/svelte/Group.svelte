<script lang="ts">
  import { Glass } from "../../../src/blur/index.js";

  let { shown }: { shown: boolean } = $props();
</script>

<div id="host">
  {#if shown}
    <Glass.Group merge={24}>
      <Glass>A</Glass>
      <Glass>B</Glass>
    </Glass.Group>
  {/if}
</div>

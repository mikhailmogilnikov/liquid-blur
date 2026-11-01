<script lang="ts">
  import { Glass } from "../../../src/blur/index.js";

  let { highlight }: { highlight: boolean } = $props();
</script>

<Glass {highlight}>Plain</Glass>

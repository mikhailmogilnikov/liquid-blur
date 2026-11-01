<script lang="ts">
  import { useGlassGroup } from "../../../src/blur/index.js";

  let { seen }: { seen: { group: unknown } } = $props();
  const group = useGlassGroup();
  $effect(() => {
    seen.group = group.group;
  });
</script>

<div {@attach group.root} class="lb lb-group"><div class="lb">A</div></div>

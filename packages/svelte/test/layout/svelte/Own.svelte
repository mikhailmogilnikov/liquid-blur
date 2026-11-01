<script lang="ts">
  import { useLayout } from "../../../src/layout/index.js";
  import { list } from "./state.svelte";

  const layout = useLayout(() => ({ spring: { duration: 0.1, bounce: 0 } }));
</script>

<div {@attach layout.root} data-root data-testid="root" data-on={layout.moving ? "" : undefined}>
  {#each list.todos as todo (todo)}<p id={todo}></p>{/each}
</div>

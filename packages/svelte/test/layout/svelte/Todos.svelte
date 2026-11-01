<script lang="ts">
  import { Layout } from "../../../src/layout/index.js";
  import { list } from "./state.svelte";

  let { enter }: { enter?: false } = $props();
</script>

<Layout.Root spring={{ duration: 0.1, bounce: 0 }} {enter}>
  {#snippet child({ props })}
    <ul {...props} data-root data-testid="root">
      {#each list.todos as todo (todo)}<li id={todo}>{todo}</li>{/each}
    </ul>
  {/snippet}
</Layout.Root>

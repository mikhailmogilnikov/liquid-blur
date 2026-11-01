<script lang="ts">
  import { Lift } from "../../../src/lift/index.js";

  let { onclick }: { onclick: () => void } = $props();
</script>

<Lift.Root>
  <Lift.Target class="ours">
    {#snippet child({ props })}
      <img {...props} alt="photo" class={["mine", props.class]} {onclick} />
    {/snippet}
  </Lift.Target>
  <Lift.Menu data-testid="menu"><Lift.Item value="a">A</Lift.Item></Lift.Menu>
</Lift.Root>

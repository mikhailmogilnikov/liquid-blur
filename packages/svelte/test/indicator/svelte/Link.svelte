<script lang="ts">
  import { Indicator } from "../../../src/indicator/index.js";
</script>

<Indicator.Root defaultValue="inbox">
  <Indicator.Thumb />
  <Indicator.Item value="inbox">
    {#snippet child({ props })}<a {...props} href="#inbox">Inbox</a>{/snippet}
  </Indicator.Item>
</Indicator.Root>

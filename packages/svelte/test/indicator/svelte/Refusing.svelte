<script lang="ts">
  import { Indicator } from "../../../src/indicator/index.js";

  // The parent holds the choice and says no to every change asked for
  let { tab }: { tab: string } = $props();
</script>

<Indicator.Root bind:value={() => tab, () => {}} trigger="press">
  <Indicator.Thumb data-testid="thumb" />
  <Indicator.Item value="overview" data-x="0">Overview</Indicator.Item>
  <Indicator.Item value="releases" data-x="100">Releases</Indicator.Item>
  <Indicator.Item value="audience" data-x="200">Audience</Indicator.Item>
</Indicator.Root>

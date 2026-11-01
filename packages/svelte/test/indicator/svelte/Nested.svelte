<script lang="ts">
  import { Indicator } from "../../../src/indicator/index.js";
</script>

<Indicator.Root defaultValue="a" trigger="manual">
  <Indicator.Thumb data-testid="thumb" />
  <Indicator.Item value="a" data-x="0">A</Indicator.Item>
  <Indicator.Root defaultValue="c" trigger="manual">
    <Indicator.Thumb />
    <Indicator.Item value="c" data-x="200">C</Indicator.Item>
  </Indicator.Root>
</Indicator.Root>

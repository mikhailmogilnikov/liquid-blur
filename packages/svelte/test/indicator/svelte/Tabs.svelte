<script lang="ts">
  import { Indicator } from "../../../src/indicator/index.js";

  let {
    value = $bindable(),
    defaultValue,
    active,
    onValueChange,
    onActiveChange,
  }: {
    value?: string;
    defaultValue?: string;
    active?: string | null;
    onValueChange?: (value: string) => void;
    onActiveChange?: (value: string | null) => void;
  } = $props();
</script>

<Indicator.Root bind:value {defaultValue} {active} {onValueChange} {onActiveChange} trigger="press">
  <Indicator.Thumb data-testid="thumb" />
  <Indicator.Item value="overview" data-x="0">Overview</Indicator.Item>
  <Indicator.Item value="releases" data-x="100">Releases</Indicator.Item>
  <Indicator.Item value="audience" data-x="200">Audience</Indicator.Item>
</Indicator.Root>

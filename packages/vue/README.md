# @fluidkit/vue

[Fluid Kit](https://fluidkit.mogilnikov.dev) for Vue: Liquid Blur's glass, morph, indicator, drag,
lift and layout as components and composables, on interruptible springs that keep their speed. Each
part can render as the element in its slot with `as-child`. It has all of
[`@fluidkit/core`](https://www.npmjs.com/package/@fluidkit/core) too, so it's the one package to
install. Vue 3.5+.

**[Documentation](https://fluidkit.mogilnikov.dev)** · [Changelog](CHANGELOG.md)

```bash
npm install @fluidkit/vue
```

```vue
<script setup lang="ts">
import "@fluidkit/vue/style.css";
import { Lift } from "@fluidkit/vue";
</script>

<template>
  <Lift.Root @select="(value) => act(value)">
    <Lift.Target as-child><img :src="src" alt="" /></Lift.Target>
    <Lift.Menu class="menu lb">
      <Lift.Item value="copy">Copy</Lift.Item>
      <Lift.Item value="share">Share</Lift.Item>
    </Lift.Menu>
  </Lift.Root>
</template>
```

Every feature, its parts and its composable are in the
[documentation](https://fluidkit.mogilnikov.dev), with Vue chosen.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

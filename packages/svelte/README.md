# @fluidkit/svelte

[Fluid Kit](https://fluidkit.mogilnikov.dev) for Svelte: Liquid Blur's glass, morph, indicator, drag,
lift and layout as components and runes, on interruptible springs that keep their speed. Each part
can render an element of yours with a `child` snippet. It has all of
[`@fluidkit/core`](https://www.npmjs.com/package/@fluidkit/core) too, so it's the one package to
install. Svelte 5.29+.

**[Documentation](https://fluidkit.mogilnikov.dev)** · [Changelog](CHANGELOG.md)

```bash
npm install @fluidkit/svelte
```

```svelte
<script lang="ts">
  import "@fluidkit/svelte/style.css";
  import { Lift } from "@fluidkit/svelte";
</script>

<Lift.Root onSelect={(value) => act(value)}>
  <Lift.Target>
    {#snippet child({ props })}<img {...props} {src} alt="" />{/snippet}
  </Lift.Target>
  <Lift.Menu class="menu lb">
    <Lift.Item value="copy">Copy</Lift.Item>
    <Lift.Item value="share">Share</Lift.Item>
  </Lift.Menu>
</Lift.Root>
```

Every feature, its parts and its function are in the [documentation](https://fluidkit.mogilnikov.dev),
with Svelte chosen.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

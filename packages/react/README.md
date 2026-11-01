# @fluidkit/react

[Fluid Kit](https://fluidkit.mogilnikov.dev) for React: Liquid Blur's glass, morph, indicator, drag,
lift and layout as components and hooks, on interruptible springs that keep their speed. Each part
can render as your own element with `render`. It has all of
[`@fluidkit/core`](https://www.npmjs.com/package/@fluidkit/core) too, so it's the one package to
install. React 18+.

**[Documentation](https://fluidkit.mogilnikov.dev)** · [Changelog](CHANGELOG.md)

```bash
npm install @fluidkit/react
```

```tsx
import "@fluidkit/react/style.css";
import { Layout, Lift, springs, transitions } from "@fluidkit/react";

<Layout.Root render={<ul className="list" />} spring={springs.snappy()} enter={transitions.blurReplace()}>
  {rows.map((row) => (
    <li key={row.id}>{row.title}</li>
  ))}
</Layout.Root>

<Lift.Root onSelect={(value) => act(value)}>
  <Lift.Target render={<img src={src} alt="" />} />
  <Lift.Menu className="menu lb">
    <Lift.Item value="copy">Copy</Lift.Item>
    <Lift.Item value="share">Share</Lift.Item>
  </Lift.Menu>
</Lift.Root>
```

Every feature, its parts and its hook are in the [documentation](https://fluidkit.mogilnikov.dev),
with React chosen.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

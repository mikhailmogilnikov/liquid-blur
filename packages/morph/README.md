# @liquid-web/morph

One element flows into another and back: one shape the whole way, its center, size and corners on
springs you can turn around mid-way. The bigger state flies itself, live, coming in magnified and
out of focus and settling sharp; the smaller one rides along as a copy, and elements they share fly
from one to the other. It works on any element; with
[`@liquid-web/blur`](https://liquid-web.mogilnikov.dev/blur) it's the same glass.

**[Documentation](https://liquid-web.mogilnikov.dev/morph)** · [Changelog](CHANGELOG.md) · Part of
[liquid-web](https://liquid-web.mogilnikov.dev)

```bash
npm install @liquid-web/morph
```

Lay out both states where they are at rest, the hidden one with `visibility: hidden`, then:

```js
import { createMorph } from "@liquid-web/morph";

const morph = createMorph({ states: [button, panel] });
button.addEventListener("click", () => morph.to(morph.current === panel ? button : panel));
```

Options, the returned morph, layout rules, shared elements, glass groups, a React hook and the
limitations are in the [documentation](https://liquid-web.mogilnikov.dev/morph).

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

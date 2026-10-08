# @liquid-web/morph

A control grows into a panel and shrinks back: one shape the whole way, its center, size and corners
on springs you can turn around mid-way, the panel's content coming in magnified and out of focus and
settling sharp. It copies whatever the control looks like, so it works on any element; with
[`@liquid-web/blur`](https://liquid-web.mogilnikov.dev/blur) it's the same glass.

**[Documentation](https://liquid-web.mogilnikov.dev/morph)** · [Changelog](CHANGELOG.md) · Part of
[liquid-web](https://liquid-web.mogilnikov.dev)

```bash
npm install @liquid-web/morph
```

Lay the panel out where it opens, hidden with `visibility: hidden`, then:

```js
import { createMorph } from "@liquid-web/morph";

const morph = createMorph({ source: button, content: panel, dismiss: true });
button.addEventListener("click", () => morph.toggle());
```

Options, the returned morph, layout rules, glass groups, a React hook and the limitations are in the
[documentation](https://liquid-web.mogilnikov.dev/morph).

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

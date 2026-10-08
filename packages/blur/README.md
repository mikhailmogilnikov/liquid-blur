# @liquid-web/blur

A glass material for the web: backdrop blur, fill, rims, springy press behaviors, and glass that
melts between shapes. Plain CSS classes and optional, framework-agnostic scripts. No refraction: a
calm, blurred surface built only from what every engine renders the same way.

**[Documentation](https://liquid-web.mogilnikov.dev/blur)** · [Changelog](CHANGELOG.md) · Part of
[liquid-web](https://liquid-web.mogilnikov.dev)

```bash
npm install @liquid-web/blur
```

```js
import "@liquid-web/blur/style.css";
```

```html
<button class="lb">Glass</button>
```

Press behaviors (`lb-highlight`, `lb-swell`, `lb-stretch`, `lb-interactive`) need one call:

```js
import { installPress } from "@liquid-web/blur/press";

installPress();
```

| Entry | What |
| --- | --- |
| `@liquid-web/blur/style.css` | The material |
| `@liquid-web/blur/press` | Highlight, swell and stretch on springs |
| `@liquid-web/blur/melt` | Glass groups: glass that melts between shapes |
| `@liquid-web/blur/auto` | Installs press on import |

Classes, variables, theming, accessibility, groups, the API and the limitations are in the
[documentation](https://liquid-web.mogilnikov.dev/blur).

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

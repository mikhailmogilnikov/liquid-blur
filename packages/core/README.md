# @fluidkit/core

[Fluid Kit](https://fluidkit.mogilnikov.dev) without a framework: Liquid Blur's glass, morph,
indicator, drag, lift and layout, on interruptible springs that keep their speed, and Apple's springs
and transitions by name, for CSS too. Each feature works on any element; what you don't import isn't
in your bundle. With React, Vue or Svelte, install [`@fluidkit/react`](https://www.npmjs.com/package/@fluidkit/react),
[`@fluidkit/vue`](https://www.npmjs.com/package/@fluidkit/vue) or
[`@fluidkit/svelte`](https://www.npmjs.com/package/@fluidkit/svelte) instead: each has all of this too.

**[Documentation](https://fluidkit.mogilnikov.dev)** · [Changelog](CHANGELOG.md)

```bash
npm install @fluidkit/core
```

Import the stylesheet once: the glass, and the springs and transitions for CSS.

```js
import "@fluidkit/core/style.css";
```

```html
<button class="lb lb-interactive">Follow</button>
```

```js
import { createDrag, createLayout, createLift, installPress, springs, transitions } from "@fluidkit/core";

// Glass that lights up, swells and stretches under the finger
installPress();

// A sheet with snap points, let go at the finger's speed
createDrag({ element: sheet, axis: "y", snaps: () => [0, innerHeight / 2, innerHeight - 88] });

// A long press lifts the photo and opens its menu
createLift({ element: photo, menu });

// Rows put in, taken out or reordered move to their new places
createLayout({ root: list, spring: springs.snappy(), enter: transitions.blurReplace() });
```

```html
<div popover class="fk-transition fk-blur-replace fk-bouncy">…</div>
```

| Feature | Docs |
| --- | --- |
| Liquid Blur: glass, press, groups that melt | [blur](https://fluidkit.mogilnikov.dev/blur), [scroll edge](https://fluidkit.mogilnikov.dev/edge) |
| Morph: one element into another and back | [morph](https://fluidkit.mogilnikov.dev/morph) |
| Indicator: one element over whatever is hovered, pressed or selected | [indicator](https://fluidkit.mogilnikov.dev/indicator) |
| Drag: rubber-band edges, flick-aware snap points | [drag](https://fluidkit.mogilnikov.dev/drag) |
| Lift: the iOS context menu | [lift](https://fluidkit.mogilnikov.dev/lift) |
| Layout: elements move to their new places | [layout](https://fluidkit.mogilnikov.dev/layout) |
| Motion: springs and transitions by name, for CSS too | [motion](https://fluidkit.mogilnikov.dev/motion) |
| The spring, measurement and the DOM contract underneath | [core](https://fluidkit.mogilnikov.dev/core) |

No build step? `@fluidkit/core/auto` installs press on import:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fluidkit/core@2/dist/style.css" />
<script type="module" src="https://cdn.jsdelivr.net/npm/@fluidkit/core@2/dist/auto.js/+esm"></script>
```

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

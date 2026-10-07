# liquid-blur

A glass material for the web: backdrop blur, fill, rims and springy press behaviors.

Not a copy of iOS Liquid Glass. It's a calm, blurred surface built only from things every engine
renders the same way: no refraction, no SVG filters, no blend modes, no pseudo-elements, no
sub-pixel hairlines. The material is plain CSS classes; an optional, framework-agnostic script adds
press behaviors.

ES modules with TypeScript declarations and no runtime dependencies. Glass groups and control-to-panel
morphs have separate entry points, so they are only loaded when used.

## Install

```bash
npm install liquid-blur
```

## Quick start

Import the stylesheet once and put `lb` on any element:

```js
import "liquid-blur/liquid-blur.css";
```

```html
<button class="lb">Glass</button>
```

If you use press behaviors (`lb-highlight`, `lb-swell`, `lb-stretch`, `lb-interactive`), install the
script once:

```js
import { installLiquidBlur } from "liquid-blur";

installLiquidBlur();
```

That's all. One delegated listener covers the whole document, so elements mounted later work
without registration — it fits React, Vue, Svelte, Astro or plain HTML equally. It's safe to call
during server rendering (it does nothing there).

Without a build step, link the stylesheet and load the `auto` entry, which installs itself:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/liquid-blur@1.0.0/dist/liquid-blur.css" />
<script type="module" src="https://cdn.jsdelivr.net/npm/liquid-blur@1.0.0/dist/auto.js"></script>
```

With a bundler, `import "liquid-blur/auto"` does the same.

### With Tailwind or other cascade layers

All styles live in `@layer liquid-blur`, so any unlayered rule of yours wins without `!important`.
Between layers, the one declared first loses. Tailwind v4 declares its layers on import, so if
liquid-blur comes after it, the glass would beat utilities like `rounded-xl`. Declare the order
once, before both imports:

```css
@layer liquid-blur, theme, base, components, utilities;
@import "tailwindcss";
@import "liquid-blur/liquid-blur.css";
```

## Classes

| Class          | What it does                                                                         |
| -------------- | ------------------------------------------------------------------------------------ |
| `lb`           | The glass material. Required.                                                        |
| `lb-clear`     | At least transparency 1, for glass over photos and video.                            |
| `lb-tinted`    | The fill is `--lb-tint`, text is `--lb-tint-text`; volume and rims stay.             |
| `lb-highlight` | Lights up where it's pressed and follows the pointer.                                |
| `lb-swell`     | Grows while pressed, on a spring: small glass more, big glass barely.                |
| `lb-stretch`   | Pulls toward the finger with rubber-band resistance and stretches along the drag.    |
| `lb-interactive` | All three press behaviors at once: the usual set for a button, chip or icon.       |

Press behaviors are independent and combine freely; `lb-interactive` is all three:

```html
<button class="lb lb-interactive">Press me</button>
<div class="lb lb-highlight lb-stretch">A bar: lights and stretches, doesn't swell</div>
<button class="lb lb-tinted lb-highlight">Tinted</button>
<div class="lb lb-clear">Over a photo</div>
```

Shape is plain `border-radius`; the default is a capsule.

```html
<div class="lb" style="border-radius: 24px; padding: 16px">Card</div>
```

### Layers

Back to front:

1. **Backdrop** — blur + saturate.
2. **Fill** — one color (or the tint) at a computed opacity.
3. **Volume** — the surface darkens toward its edges on a smooth curve and catches a little light
   just under the top and bottom rims.
4. **Rims** — light hairlines along the top and bottom (inset shadows, so on a capsule they fade
   toward the ends).
5. **Edge** — a dark hairline just outside.
6. **Drop shadow.**

## Customization

All public variables are inherited, so you can set them on any ancestor — like SwiftUI environment
values — and every glass inside picks them up.

| Variable                | Default            | Meaning                                                    |
| ----------------------- | ------------------ | ---------------------------------------------------------- |
| `--lb-dark`             | per theme          | `0` = light, `1` = dark. See [Theming](#theming).          |
| `--lb-transparency`     | `0.5`              | `0` = opaque, `1` = clear. Moves fill and blur together.   |
| `--lb-depth`            | `0.5`              | `0` = flat, `1` = pronounced. Moves shade, glow and rims.  |
| `--lb-fill-light`       | `#ffffff`          | Fill color in the light theme.                             |
| `--lb-fill-dark`        | `#3a3a3a`          | Fill color in the dark theme.                              |
| `--lb-fill`             | unset              | One fill for both themes; wins over the two above.         |
| `--lb-text-light`       | `#000000`          | Text color in the light theme.                             |
| `--lb-text-dark`        | `#ffffff`          | Text color in the dark theme.                              |
| `--lb-text`             | unset              | One text color for both themes.                            |
| `--lb-tint`             | `#007aff`          | Color of `lb-tinted` glass.                                |
| `--lb-tint-text`        | `#ffffff`          | Text color on `lb-tinted` glass.                           |
| `--lb-shade-color`      | `#000000`          | The dark parts: volume shading, edge, drop shadow.         |
| `--lb-shine-color`      | `#ffffff`          | The light parts: rims, glow, press highlight.              |
| `--lb-highlight-size`   | `1`                | Reach of the press highlight, as a multiplier on its size-based default. |
| `--lb-swell`            | `1.1`              | Pressed scale at button size; smaller grows more, bigger less. |
| `--lb-stretch`          | `2`                | Stretch strength; `0` turns it off.                        |

```css
.toolbar {
  --lb-transparency: 0.8;
  --lb-depth: 0.3;
}

.danger {
  --lb-tint: #ff3b30;
}
```

### Colors

Colors resolve on the glass itself, so you set them on any ancestor and they follow the theme in
effect — including `data-theme` on a subtree:

```css
/* Your own neutral, per theme */
:root {
  --lb-fill-light: #f5f5f7;
  --lb-fill-dark: #1c1c1e;
}

/* Warm glass: the fill, the shading and the rims all lean amber */
.warm {
  --lb-fill-light: #ffe08a;
  --lb-shade-color: #5a2a00;
  --lb-shine-color: #fff4c0;
}

/* Same fill in both themes */
.brand {
  --lb-fill: #0a3;
}

/* Light tint needs dark text */
.warning {
  --lb-tint: #ffcc00;
  --lb-tint-text: #111;
}
```

Transparency and depth still apply on top: you set the color, the material decides its opacity.

The glass sets its own text color for contrast with its fill. A `color` on the element itself
still wins, as does `--lb-text`.

Everything prefixed `--_` is internal calibration and may change without notice.

## Theming

The theme is one inherited number, `--lb-dark`: `0` is light, `1` is dark. Every theme-dependent
value is mixed by it on the glass itself, so it works on any subtree.

By default it follows `prefers-color-scheme`, and `data-theme="light"` or `data-theme="dark"` on
any element switches its subtree:

```html
<html data-theme="dark">
  …
  <section data-theme="light">
    <button class="lb">Always light</button>
  </section>
</html>
```

Any other theme switch plugs in by setting `--lb-dark` — a `.dark` class (Tailwind, shadcn,
next-themes with `attribute="class"`), daisyUI theme names, anything:

```css
.dark { --lb-dark: 1; }
[data-theme="dracula"] { --lb-dark: 1; }
```

## Accessibility

- `data-lb-material="solid"` on any ancestor makes glass inside it opaque.
- `prefers-reduced-transparency: reduce` — glass becomes opaque, no backdrop filter.
- `prefers-contrast: more` — opaque, with a stronger edge.
- `forced-colors: active` — an outline replaces the dropped backgrounds and shadows. A melted
  glass group gets one outline around the whole shape.
- `prefers-reduced-motion: reduce` — no swell, no stretch.
- Enter and Space on a focused glass element press it until that key is released.

## Press behaviors in detail

- **Pressed state.** While a pointer is down the element gets `data-lb-pressed`, which you can
  style too. On touch it appears after a short delay, so a finger that lands to scroll doesn't
  flash it; a quick tap still gets a brief flash on release. Without `installLiquidBlur()`,
  highlight and swell fall back to `:active`, centered.
- **Highlight** is a soft glow with no edge, sized to the element: about the size of a small
  button, broad on a card, capped on a panel so it never floods it. `--lb-highlight-size` scales it.
- **Highlight and swell** run on springs, interruptible mid-flight. The script writes them
  inline — the light's strength and `scale` — and removes them once they come to rest, together
  with the press point `--lb-press-x` / `--lb-press-y`. No `transition` is set, so yours stays
  intact, and the swell multiplies your own `scale` instead of replacing it.
- **Swell and stretch** have mass: the bigger the element, the less it grows or gives to the
  finger, the slower it moves and the less it bounces. A small button is lively, a large card
  barely stirs.
  `--lb-swell` and `--lb-stretch` set the strength on top.
- **Stretch** writes only `transform`, per frame, with no layout reads. Your own transform is kept:
  the stretch is appended to it, and your inline `transform` / `will-change` are restored after
  the spring settles. It sets `touch-action: none` and disables text selection on the element.
- **Releasing outside** the element (plus a 32px margin) cancels the click, as on iOS.

### Caveats

- Don't transition `scale` (with swell) or `transform` (with stretch) on the same element: the
  script writes them every frame, and a transition would lag behind it.
- Press behaviors are for single controls, not containers: highlight lights the whole element on
  any press inside it, and stretch blocks scrolling and text selection in its whole subtree.

## Glass groups

Glass that melts between shapes when they come close, like drops of liquid: put the pieces in one
`.lb-group` and they share a single surface, one backdrop clipped to the merged outline, so nothing
blurs twice. Groups live in their own entry, `liquid-blur/group`, so they cost nothing to pages
that don't use them.

```html
<div class="lb-group">
  <div class="lb">…</div>
  <button class="lb lb-interactive">…</button>
</div>
```

```js
import { installGlassGroups } from "liquid-blur/group";

installGlassGroups();
```

- **Children are glass** (`.lb`) and stay exactly that while none of them are close: the group
  draws nothing and only watches. Without the script they're plain glass too.
- **Merging** starts at `--lb-merge` (default `24px`) between two children; set it on the group.
- **Motion is followed on its own**: springs, `lb-stretch` and `lb-swell`, any inline style or
  class change of a child, its size, and CSS transitions and animations on the children. Moved
  some other way (layout from outside the group), call `update()` on it.
- **Theme and material** come from the same variables as any glass; the group root is `.lb`.
  Children are measured with their transforms; scaling the group or an ancestor is fine,
  rotating it isn't.
- The root gets `data-lb-melted` while it draws for the children. The shared glass takes the
  root's material; a `lb-tinted` child keeps its tint on top of it.

### Server rendering

`liquid-blur/group` is safe to import on the server, and `installGlassGroups()` does nothing
there. Rendered without the script, the children are plain glass; close ones melt once it runs.
With a framework that hydrates (React, Vue, Svelte):

- **Install after hydration**, in an effect: the group adds its own elements to the root, and
  doing that before hydration makes the DOM differ from the server's markup.
- **Write `lb lb-group` in the markup**, not just `lb-group`: the script adds `lb` if it's missing,
  but a re-render that sets the class would drop it again.

```tsx
import { useEffect } from "react";
import { installGlassGroups } from "liquid-blur/group";

export function Toolbar() {
  useEffect(() => installGlassGroups(), []);
  return (
    <div className="lb lb-group">
      <div className="lb">…</div>
      <button className="lb lb-interactive">…</button>
    </div>
  );
}
```

## API

| Entry point | Exports |
| --- | --- |
| `liquid-blur` | `installLiquidBlur`, `SpringAnimator`; types `SpringConfig`, `SpringParams` |
| `liquid-blur/auto` | Installs press behaviors on import; no named exports |
| `liquid-blur/group` | `installGlassGroups`, `createGlassGroup`; type `GlassGroup` |
| `liquid-blur/morph` | `createMorph`, `defaultMorphSprings`; types `Morph`, `MorphOptions`, `MorphSprings` |
| `liquid-blur/liquid-blur.css` | Stylesheet |

### `installLiquidBlur(root?: Document): () => void`

Installs press behaviors on a document (default: `document`) and returns a cleanup function.
Installing twice returns the first install's cleanup. Sets `data-lb-interaction` on `<html>` while
installed. Looks through open shadow roots. Pass an iframe's `contentDocument` to cover the
iframe. Without a DOM it returns a no-op.

```js
const uninstall = installLiquidBlur();
// later
uninstall();
```

### `installGlassGroups(root?: Document): () => void`

From `liquid-blur/group`. Makes every `.lb-group` in the document a glass group, including ones
mounted later, and lets go of a group once its root leaves the document. Installing twice returns
the first install's cleanup; the cleanup destroys the groups it made. Without a DOM it returns a
no-op.

### `createGlassGroup(root: HTMLElement): GlassGroup`

From `liquid-blur/group`. One group by hand, for an element you manage yourself. Adds `lb` and
`lb-group` to the root if missing. Returns `{ update(), destroy() }`; creating a group for the same
root twice returns the first.

```ts
import { createGlassGroup } from "liquid-blur/group";

const group = createGlassGroup(toolbar);
// a child moved by something the group can't see
group.update();
// later
group.destroy();
```

### `createMorph(options: MorphOptions): Morph`

From `liquid-blur/morph`. A glass control grows into a panel and shrinks back. Give it the control
(`source`) and the panel's content (`content`), already laid out where the panel should open.
The glass is copied from the control; the content does not need its own `lb` class.

```html
<div class="morph-scene">
  <button id="more" class="lb" type="button" aria-controls="panel">More</button>
  <div id="panel">
    <p>Panel content</p>
    <button id="close-panel" type="button">Close</button>
  </div>
</div>

<style>
  .morph-scene { position: relative; min-height: 240px; }
  #more { width: 88px; height: 44px; border-radius: 22px; }
  #panel {
    position: absolute;
    left: 0;
    top: 0;
    width: min(280px, 100%);
    height: 220px;
    box-sizing: border-box;
    padding: 20px;
    border-radius: 28px;
    visibility: hidden;
    z-index: 2;
  }
</style>
```

Run after the elements mount:

```js
import "liquid-blur/liquid-blur.css";
import { createMorph } from "liquid-blur/morph";

const source = document.getElementById("more");
const content = document.getElementById("panel");
const close = document.getElementById("close-panel");
const morph = createMorph({
  source,
  content,
  onRest(open) {
    (open ? close : source).focus({ preventScroll: true });
  },
});

const toggle = () => morph.toggle();
const dismiss = () => morph.close();
source.addEventListener("click", toggle);
close.addEventListener("click", dismiss);

// On unmount:
// source.removeEventListener("click", toggle);
// close.removeEventListener("click", dismiss);
// morph.destroy();
```

| Option | Meaning |
| --- | --- |
| `source: HTMLElement` | The originating control, with a parent in the DOM |
| `content: HTMLElement` | The panel content, with a measurable open position and size |
| `spring?: { open: MorphSprings; close: MorphSprings }` | Full spring settings for each direction; defaults to `defaultMorphSprings` |
| `onRest?: (open: boolean) => void` | Called when the animation settles open or closed |

The returned `Morph` has `open()`, `close()`, `toggle()` and `destroy()`. Its read-only `isOpen`
is the requested state, updated immediately, rather than an indication that the animation has
finished. Reversing while moving preserves velocity. `destroy()` stops motion, removes the copies,
restores the content's saved inline styles, shows the control and removes its `aria-expanded`.
It does not remove event listeners added by your application.

Each `MorphSprings` set contains `x`, `y`, `width`, `height` and `progress` springs. Change the
defaults selectively:

```js
import { createMorph, defaultMorphSprings } from "liquid-blur/morph";

const morph = createMorph({
  source,
  content,
  spring: {
    open: {
      ...defaultMorphSprings.open,
      y: { duration: 0.4, bounce: 0.3, settle: 0.1 },
    },
    close: defaultMorphSprings.close,
  },
});
```

Layout and lifecycle:

- Keep the content separate from the glass and above it in stacking order. In a group, a morph
  that covers a neighbor lifts its glass out of the group; `z-index: 2` keeps the content above it.
- Hide content with `visibility: hidden`, not `display: none` or the `hidden` attribute: it must
  remain measurable. Its computed `border-radius` defines the open panel's corners.
- The morph manages inline `transform`, `opacity`, `filter` and `clip-path` on the content.
  Avoid competing transitions on these properties. Apply press behaviors to the source only.
- Source styles should use classes that also match its clone, rather than only its `id`. Inline
  styles on the source are not copied. The example's measured size and radius are set by the morph.
- Geometry is measured on open and close, not continuously during scrolling or resizing. Rotated
  or scaled ancestors are unsupported. Groups merge using round arcs even with squircle children.
- With reduced motion, the panel and control swap immediately. `aria-expanded` is managed;
  focus, Escape, outside clicks and any dialog or menu keyboard behavior are your responsibility.
- Importing the module is safe during server rendering; call `createMorph()` only in the browser,
  after mounting or hydration, and call `destroy()` on unmount.

### `SpringAnimator`

The interruptible spring that drives the press behaviors, exported for your own animations.
Animates several numeric channels at once; retargeting keeps the current velocity, so reversing
mid-flight stays smooth — which CSS transitions can't do.

```ts
import { SpringAnimator, type SpringParams } from "liquid-blur";

const spring = new SpringAnimator(
  { width: 100, radius: 12 },
  { duration: 0.4, bounce: 0.2 }, // SwiftUI-style: perceptual duration in seconds, bounce 0..1
  ({ width, radius }) => {
    el.style.width = `${width}px`;
    el.style.borderRadius = `${radius}px`;
  },
  () => console.log("at rest"), // optional
);

spring.to({ width: 240, radius: 24 });
spring.to({ width: 100, radius: 12 }, { duration: 0.6, bounce: 0 }); // new params are optional
spring.values(); // current values
spring.stop();
```

Channels can also have springs of their own:

```ts
new SpringAnimator(
  { opacity: 0, scale: 1 },
  { opacity: { duration: 0.15, bounce: 0 }, scale: { duration: 0.45, bounce: 0.3 } },
  ({ opacity, scale }) => { /* … */ },
);
```

`SpringParams` is `{ duration: number; bounce: number; settle?: number }`. `duration` is a positive
perceptual duration in seconds, not a fixed completion deadline. `bounce` ranges from `0` (no
overshoot) to `1`; use a value below `1` for a spring that settles. `settle` changes the bounce
after the first reversal and defaults to `bounce`.

## Browser support

Any browser with `backdrop-filter`, `color-mix()` and CSS `pow()`. `@property` is used for
per-element switches and the highlight fade; browsers without it (Firefox < 128) still render the
glass, with fallbacks.

Glass groups also use `clip-path: path()` and Canvas 2D. Morph corner shapes use `corner-shape`
where supported and otherwise stay round. JavaScript is shipped as ESM targeting ES2022.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

# @liquid-web/morph

A control grows into a panel and shrinks back: one shape the whole way, its center, size and corners
on interruptible springs, the panel's content coming in magnified and out of focus and settling
sharp. Reversing mid-way keeps the velocity.

It copies whatever the control looks like, so it works on any element. With
[`@liquid-web/blur`](../blur/README.md) it's the same glass growing into a panel, and inside a glass
group it lifts over the group or melts with it.

Part of [liquid-web](../../README.md). ES modules with TypeScript declarations; its one dependency is
[`@liquid-web/core`](../core/README.md).

## Install

```bash
npm install @liquid-web/morph
```

## API

| Entry point | Exports |
| --- | --- |
| `@liquid-web/morph` | `createMorph`, `defaultMorphSprings`; types `Morph`, `MorphOptions`, `MorphSprings`, `MorphPhase`, `MorphMove` |

### `createMorph(options: MorphOptions): Morph`

Give it the control (`source`) and the panel's content (`content`), already laid out where the
panel should open. The shape that morphs is a copy of the control; the content needs no background
of its own. The example uses glass from `@liquid-web/blur` (`class="lb"`); any styled control works.

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
import "@liquid-web/blur/style.css"; // the glass, if the control is glass
import { createMorph } from "@liquid-web/morph";

const source = document.getElementById("more");
const content = document.getElementById("panel");
const close = document.getElementById("close-panel");
const morph = createMorph({
  source,
  content,
  // Escape and a press outside close it
  dismiss: true,
  // Into the panel as it sets off; back to the control once it's there again
  onStart(open) {
    if (open) close.focus({ preventScroll: true });
  },
  onRest(open) {
    if (!open && content.contains(document.activeElement)) source.focus({ preventScroll: true });
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
| `container?: HTMLElement` | Where the glass goes instead of next to the control, e.g. out of a parent with `overflow: hidden` |
| `spring?: { open?: Partial<MorphSprings>; close?: Partial<MorphSprings> }` | Spring settings for each direction; anything left out comes from `defaultMorphSprings` |
| `initialOpen?: boolean` | Starts open, at rest, without calling `onStart` or `onRest` |
| `dismiss?: boolean \| { escape?: boolean; outside?: boolean }` | Closes on Escape and on a press outside the panel and the control; `true` for both, off by default |
| `onStart?: (open: boolean) => void` | Called when the animation sets off, including when it reverses mid-way |
| `onRest?: (open: boolean) => void` | Called when the animation settles open or closed |

The returned `Morph`:

| Member | Meaning |
| --- | --- |
| `isOpen` | The requested state, updated immediately |
| `phase` | `"closed"`, `"opening"`, `"open"` or `"closing"`: whether it has got there yet |
| `open(move?)`, `close(move?)`, `toggle(move?)` | Return a `Promise<boolean>`: `true` once it rests where asked, `false` if it reversed or was destroyed first. `{ instant: true }` swaps at once, as with reduced motion |
| `update()` | Reads the boxes again and follows them |
| `destroy()` | Stops motion, removes the copies, restores the content's inline styles, shows the control and removes its `aria-expanded` |

Reversing while moving preserves velocity. While open, the glass follows the content when its
size changes and when the window resizes; call `update()` after anything else moves the content or
the control. `destroy()` doesn't remove event listeners added by your application; calls after it
do nothing.

Each `MorphSprings` set contains `x`, `y`, `width`, `height` and `progress` springs. Pass only
the ones you change:

```js
import { createMorph } from "@liquid-web/morph";

const morph = createMorph({
  source,
  content,
  spring: {
    open: { y: { duration: 0.4, bounce: 0.3, settle: 0.1 } },
  },
});
```

Layout and lifecycle:

- Keep the content separate from the glass and above it in stacking order. In a group, a morph
  that covers a neighbor lifts its glass out of the group (`z-index: 1`), as does a `container`;
  `z-index: 2` keeps the content above it.
- Hide content with `visibility: hidden`, not `display: none` or the `hidden` attribute: it must
  remain measurable. Its computed `border-radius` defines the open panel's corners, each its own
  (a sheet rounded on top only stays square below); a percent resolves against the panel's box,
  and an elliptical corner becomes the smaller of its two radii.
- The morph manages inline `transform`, `opacity`, `filter` and `clip-path` on the content.
  Avoid competing transitions on these properties. Apply press behaviors to the source only.
  A translation of the content's own, such as `translate: -50% -50%` or
  `transform: translate(-50%, -50%)` for centering, is kept; rotating or scaling it is not supported.
- Source styles should use classes that also match its clone, rather than only its `id`. Inline
  styles on the source are not copied. The example's measured size and radius are set by the morph.
- The copy that morphs is added next to the control only while the panel is open or moving, so
  selectors such as `:last-child` keep matching at rest. Lifted over a group it sits right after
  the group, and with a `container` inside that: style the control with classes rather than
  selectors through its parent, and make sure the container inherits the same theme.
- While the panel is out the control is unseen (`opacity: 0`, marked `data-lw-away`) but stays
  focusable and in the accessibility tree, so its `aria-expanded` is read and focus on it isn't
  lost. Groups leave it out. Its own inline `opacity` is put back after.
- Geometry is measured on open and close, and while open when the content resizes or the window
  does. Scrolling during the animation isn't followed. Rotated or scaled ancestors are unsupported.
  Groups merge using round arcs even with squircle children.
- With reduced motion, the panel and control swap immediately. `aria-expanded` is managed, and
  `dismiss` handles Escape and outside presses; focus and any dialog or menu keyboard behavior are
  your responsibility.
- Importing the module is safe during server rendering; call `createMorph()` only in the browser,
  after mounting or hydration, and call `destroy()` on unmount.

In React, a small hook covers the lifecycle. Keep the panel's `visibility: hidden` in its
stylesheet, not inline, so a re-render doesn't fight the morph:

```tsx
import { useEffect, useRef, useState } from "react";
import { createMorph, type Morph, type MorphOptions } from "@liquid-web/morph";

/** Options are read once, on mount */
export function useMorph(options: Omit<MorphOptions, "source" | "content"> = {}) {
  const source = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const morph = useRef<Morph | null>(null);
  const [open, setOpen] = useState(options.initialOpen ?? false);
  useEffect(() => {
    const m = createMorph({
      ...options,
      source: source.current!,
      content: content.current!,
      onStart(next) {
        setOpen(next);
        options.onStart?.(next);
      },
    });
    morph.current = m;
    return () => m.destroy();
  }, []);
  return {
    source,
    content,
    open,
    toggle: () => morph.current?.toggle(),
    close: () => morph.current?.close(),
  };
}

export function More() {
  const morph = useMorph({ dismiss: true });
  return (
    <div className="morph-scene">
      <button ref={morph.source} className="lb" type="button" aria-controls="panel" onClick={morph.toggle}>
        More
      </button>
      <div ref={morph.content} id="panel" role="menu">
        <button type="button" onClick={morph.close}>Close</button>
      </div>
    </div>
  );
}
```

## Browser support

Any browser with ES2022 and `clip-path: inset()`. Corner shapes interpolate where `corner-shape` is
supported; elsewhere corners stay round.

## Limitations


- Geometry is measured on open and close, and while open when the content or window resizes;
  other moves need `update()`. Scrolling during the animation isn't followed.
- Rotated or scaled ancestors aren't supported, nor a content transform other than a translation.
- Corners interpolate as circles: an elliptical radius becomes the smaller of its two, and corner
  shapes follow the top-left corner's.
- A glass copy outside the control's parent (lifted over a group, or in a `container`) isn't
  reached by selectors through that parent.
- The content must stay measurable: hide it with `visibility: hidden`, not `display: none`.
- Focus and dialog or menu keyboard behavior are yours to handle; `dismiss` covers Escape and
  outside presses.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).

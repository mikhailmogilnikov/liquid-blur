# @fluidkit/vue

## 2.0.0

### Major Changes

- befc924: Fluid Kit 2.0: one package for each framework instead of one for each feature. An app installs one: `@fluidkit/react`, `@fluidkit/vue`, `@fluidkit/svelte`, or `@fluidkit/core` without a framework. All four come out together, at the same version, from now on.
  
  - `@fluidkit/core` has every engine (Liquid Blur's press and groups, morph, indicator, drag, lift and the new layout), the spring and Motion below, and one stylesheet, `@fluidkit/core/style.css`: the glass and the springs and transitions for CSS. Nothing the app doesn't import ends up in its bundle; features still meet only through the DOM.
  - `@fluidkit/react`, `@fluidkit/vue` and `@fluidkit/svelte` have every feature's components and hooks (composables, runes) and the helpers they're made of, and give all of core besides: `springs` or `createLayout` come from the same package, and so does `style.css`. Core's engine types named as the components are (`Drag`, `Indicator`, `Layout`, `Lift`, `Morph`) are there as `DragEngine` and so on.
  - What the features do and take hasn't changed; only where they're imported from:
  
    | Before | Now |
    | --- | --- |
    | `@fluidkit/morph`, `@fluidkit/indicator`, `@fluidkit/drag`, `@fluidkit/lift` | `@fluidkit/core` |
    | `@fluidkit/blur/press`, `@fluidkit/blur/melt` | `@fluidkit/core` |
    | `@fluidkit/blur/auto` | `@fluidkit/core/auto` |
    | `@fluidkit/blur/style.css` | `@fluidkit/core/style.css`, or your framework's package's `style.css` |
    | `@fluidkit/<feature>/react`, `@fluidkit/core/react` | `@fluidkit/react` |
    | `@fluidkit/<feature>/vue`, `@fluidkit/core/vue` | `@fluidkit/vue` |
    | `@fluidkit/<feature>/svelte`, `@fluidkit/core/svelte` | `@fluidkit/svelte` |
  
    `@fluidkit/blur`, `@fluidkit/morph`, `@fluidkit/indicator`, `@fluidkit/drag` and `@fluidkit/lift` stay on npm as they are, and get no more releases.
  
  New in 2.0:
  
  - Layout: when the layout changes, its elements move to where they now are instead of jumping. `createLayout({ root })` watches a root and its items (its children, or `items` as a selector) and follows rows put in, taken out or reordered, their `class` and `hidden`, and their sizes, before the browser paints the change. Every item that moved is shown where it was drawn and goes to where it is on a spring (`translate`); another change on the way sets off from where everything is drawn then, keeping its speed. Sizes change for real: an item whose size changed, and the root itself, change `width` and `height` on the spring, clipped along that axis meanwhile, so text isn't squeezed and what comes after them moves with them; `size: false` moves positions only. A new item comes in from transparent and a little smaller (`enter`, or any of the `transitions`: blurred, moved); one taken out goes out where it was (`exit`), the element itself put back for the while, inert and hidden from assistive technology, then removed. Put back meanwhile, it stays. Its own translation (a drag's offset) is added to, its own scale multiplied, and `transform` is left alone, so a glass press and a morph go on; an item being dragged isn't moved. `spring`, `onStart`, `onRest`; `moving`, `update()`, `set()`, `destroy()`. Reduced motion is all at once, and so is a change while the root isn't drawn (hidden in a tab not shown, say) and its showing again. `Layout.Root` and `useLayout()` for each framework.
  - Motion: Apple's springs and transitions by name, for every engine and for CSS. `springs.smooth()`, `springs.snappy()`, `springs.bouncy()` and `springs.interactive()` give a `SpringParams` for any `spring`; given `{ duration, extraBounce }`, they tune it, as SwiftUI's `.snappy(duration:extraBounce:)` does. `transitions.opacity()`, `transitions.scale()`, `transitions.blurReplace()` and `transitions.move()` give a `TransitionParams` (`{ opacity, scale, blur, x, y }`): how an element comes in and goes out, for Layout's `enter` and `exit`, combined by spreading. `springCss(params)` writes a spring for CSS: its own curve as a `linear()` easing, and how long it takes to come to rest. In the stylesheet, each spring is `--fk-<name>` (and its `-easing` and `-duration`), and `fk-transition` with `fk-opacity`, `fk-scale`, `fk-blur-replace`, `fk-move` and the springs' classes brings an element in as it's put in the page or shown and takes it out as it's hidden (`hidden`, a `<dialog>` or popover closed), tuned with variables. Reduced motion only fades.

### Patch Changes

- Updated dependencies [befc924]
  - @fluidkit/core@2.0.0

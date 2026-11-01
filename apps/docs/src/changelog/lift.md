# @fluidkit/lift

## 1.4.1

### Patch Changes

- 10d799d: An open lift keeps the page still on iOS: a touch on a menu that doesn't scroll, or one at its end, no longer scrolls the page under it.

## 1.4.0

### Minor Changes

- 347178f: Svelte components and functions: `@fluidkit/lift/svelte`, `@fluidkit/indicator/svelte`, `@fluidkit/morph/svelte`, `@fluidkit/drag/svelte` and `@fluidkit/blur/svelte`. Svelte is an optional peer dependency (5.29+, for attachments). The components ship as `.svelte` files your bundler compiles.
  
  - Every part renders its own element, or an element of yours with a `child` snippet, as in bits-ui: spread the `props` it gives, which carry the attachment that connects it. State is bindable (`bind:open`, `bind:value`, `bind:snap`), and a getter and setter binding lets you refuse a change. Events are callback props (`onSelect`, `onValueChange`, `onSnapChange`, …).
  - Lift: `Lift.Root`, `Lift.Target`, `Lift.Menu`, `Lift.Item`, `Lift.Separator`, `Lift.Preview`, plus `useLift()`.
  - Indicator: `Indicator.Root`, `Indicator.Thumb`, `Indicator.Item`, plus `useIndicator()`.
  - Morph: `Morph.Root`, `Morph.State`, `Morph.Trigger`, `Morph.Match`, plus `useMorph()`. The animation starts after the new value renders; states added or removed later are handled automatically.
  - Drag: `Drag.Root`, `Drag.Handle`, `Drag.Scroll`, plus `useDrag()`. Snap points and bounds can be a function of the parent's size.
  - Blur: `Glass` and `Glass.Group`, plus `glass()` (returns `{ class, style }` to spread), `usePress()` and `useGlassGroup()`.
  - Core: `@fluidkit/core/svelte`, the helpers they're built from: `mergeProps`, `PartProps`, `elementRef`, `syncSettings`.
  - The `use*()` functions take their options as a getter and return attachments for `{@attach}`. Call them in a component's script.

### Patch Changes

- Updated dependencies [347178f]
  - @fluidkit/core@1.6.0

## 1.3.0

### Minor Changes

- 54cc634: Vue components and composables: `@fluidkit/lift/vue` and `@fluidkit/indicator/vue`. Vue is an optional peer dependency (3.5+).
  
  - The same parts as in React: `Lift.Root`, `Lift.Target`, `Lift.Menu`, `Lift.Item`, `Lift.Separator`, `Lift.Preview`; `Indicator.Root`, `Indicator.Thumb`, `Indicator.Item`. Namespaced, so `<Lift.Root>` works in `<script setup>` templates.
  - Any part can render as the element in its slot with `as-child`, as in Reka UI; the slot receives the part's state. State is exposed as the same data attributes.
  - `v-model:open` on `Lift.Root`, `v-model` on `Indicator.Root`, plus `active` and `@active-change`. A lift item's `@select` event can call `preventDefault()` to keep the menu open.
  - Composables for custom markup: `useLift()` and `useIndicator()` return function refs for `:ref`. Options can be an object, a ref or a getter.
  - Engines are created once their elements are mounted and updated with `set()` when props change. Server rendering (including Nuxt) and unmounting while a lift is open work.
  - `@fluidkit/core/vue`: the helpers the adapters are built from (`renderPart`, `attachRef`, `useControllable`, `watchSettings`…).

### Patch Changes

- Updated dependencies [54cc634]
  - @fluidkit/core@1.5.0

## 1.2.0

### Minor Changes

- b92745f: `set(settings)`: a lift, drag, indicator or morph takes new options once made, the rest kept, without being made again: what a component needs as its props change. Everything but the elements it's made on.
  
  - Lift: all but `element` and `menu`. Open, it takes them as it goes (its dim, blur, callbacks) or the next time it opens. `LiftSettings` is their type.
  - Drag: all but `element`, `handle`, `axis`, `scroll` and `initial`. New snap points or bounds are followed at once, as by `update()`. `DragSettings`.
  - Indicator: all but `container`, `indicator` and `rest`, which is a property of its own. A new `trigger` (or `focus`) takes over at once, and what pointed at it under the old one lets go. `IndicatorSettings`.
  - Morph: its `spring` and callbacks; new springs take the next flight. `MorphSettings`.
- 20773e7: `onSelect` giving back `false` keeps the menu open: an item chosen that doesn't close it, a toggle in the menu, say. Anything else closes it, as before.
- c80a491: React: `@fluidkit/lift/react` and `@fluidkit/indicator/react`, React an optional peer (18 or later).
  
  - Components by default, composed of parts: `Lift.Root`, `Lift.Target`, `Lift.Menu`, `Lift.Item`, `Lift.Separator`, `Lift.Preview`; `Indicator.Root`, `Indicator.Thumb`, `Indicator.Item`. Each part renders as an element of yours with `render`, as in Base UI (`render={<img src={src} />}`, or a function of its props and state), our props merged into it. Headless: their state is in data attributes (`data-state`, `data-selected`, `data-active`, `data-disabled`) for any CSS.
  - Controlled or not: `open` / `defaultOpen` / `onOpenChange` for a lift; `value` / `defaultValue` / `onValueChange` for an indicator, and `active` for an item pointed at from elsewhere (the finger on a lift's menu, say). A lift's items have values, `onSelect` on the root is given the one chosen, and an item's own `onSelect` can `preventDefault()` to keep the menu open.
  - Hooks for markup of your own: `useLift()` and `useIndicator()` give refs to bind the engine to your elements, its state and the engine itself.
  - An engine is made once its elements are in the page and given new props by `set()`, never made again for them; callbacks are always the latest. Strict mode, React 18's and 19's refs, server rendering and unmounting while a lift is open all work.
  - `@fluidkit/core/react`: what the adapters are made of (`renderPart`, `mergeProps`, `useMergedRefs`, `useAttach`, `useControllable`, `useSettings`…), for a component of your own.

### Patch Changes

- Updated dependencies [c80a491]
  - @fluidkit/core@1.4.0

## 1.1.0

### Minor Changes

- 571a37f: A strict review's fixes, and keys for the menu.
  
  - `preview` keeps its own size, centered on the element and kept on screen, as iOS's bigger previews are; one taken from the page goes back where it was, its style and attributes as they were. It was squeezed into the element's box and left out of the page.
  - Closing, what's lifted settles on the element where it is by then: a page scrolled while it was open (a dragged scrollbar, a smooth scroll still running) no longer leaves it to land where the element was, the element showing elsewhere.
  - The page doesn't scroll under it by keys either: PageUp, PageDown, Space and the side arrows are kept from it.
  - The arrow keys go through the menu's items, past disabled ones, Home and End to the ends.
  - A copy is a picture: its form controls are in no form or radio group (a checked radio in it unchecked its original in the page), its frames are empty boxes instead of being loaded again, its videos their frame as it was.
  - A disabled item (`:disabled`, `aria-disabled="true"`) is never chosen, a click on it included; opened by a key, the first item focused is the first enabled one.
  - No text is selected while a mouse that lifted it slides onto the menu (Safari selected the items).
  - Closed by the browser itself (a second Escape it doesn't let a page keep open), the element is shown at once, not after the springs.
  - One lift is open at a time in a page: another opening closes it at once, not two modals stacked.
  - A window made only shorter (a phone's bars, its keyboard) no longer closes it; narrower or wider still does.

## 1.0.0

### Major Changes

- 6593269: First release.
  
  - A long press, a right click or the menu key lifts an element above everything, the page dimmed and blurred behind it, and opens your menu beside it: `createLift({ element, menu })`, as iOS's context menus.
  - What lifts is a copy dressed as the element is drawn (every computed style written on it), in a modal `<dialog>` over any `overflow`, `z-index` and transform; the element is hidden where it is and keeps its room. `preview` lifts an element of your own instead: something live, or a bigger preview.
  - The menu, yours, is moved into the dialog while it's open and put back after; it opens under the element, or over it with no room under, on the element's side of the screen, and the element moves up for it with room neither way.
  - The same finger slides onto an item and lets go to choose it: items it's over are marked `data-highlighted` and handed to `onHighlight`; let go without moving, the menu stays open. A choice clicks the item, calls `onSelect` and closes the menu.
  - The press: held still for `delay` (500ms), it lifts; moved, or taken by a scroll, it doesn't. `data-lifting` while it's held, `data-lifted` while open; no text selected, no iOS callout, and the click a long press would end in is dropped.
  - Springs: it rises from where it's drawn to a little bigger (`scale`), the dim and the menu coming in with it, and settles exactly back before the element shows again. `dim`, `blur`, `placement`, `spring`; `onOpen`, `onClose`; `opened`, `open()`, `close()`, `destroy()`. Escape closes it, focus goes back; the page doesn't scroll under it; reduced motion is all at once.
  - ESM with TypeScript declarations. Depends on `@fluidkit/core`.
  
  ### Compatibility
  
  - A copy is a picture of the element as it was. Pseudo-elements are dressed only where the page's rules still match the copy out of its place.

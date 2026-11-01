# Changelog

## 1.3.1

### Patch Changes

- 2ee7de1: `defaultValue` no longer decides the type of the values in React and Vue, as it already didn't in Svelte: `useMorph({ defaultValue: "a" })` now takes `to("b")`, and `useIndicator({ defaultValue: "a" })` takes `select("b")`, without naming the type.

## 1.3.0

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

## 1.2.0

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

## 1.1.0

### Minor Changes

- b92745f: `set(settings)`: a lift, drag, indicator or morph takes new options once made, the rest kept, without being made again: what a component needs as its props change. Everything but the elements it's made on.
  
  - Lift: all but `element` and `menu`. Open, it takes them as it goes (its dim, blur, callbacks) or the next time it opens. `LiftSettings` is their type.
  - Drag: all but `element`, `handle`, `axis`, `scroll` and `initial`. New snap points or bounds are followed at once, as by `update()`. `DragSettings`.
  - Indicator: all but `container`, `indicator` and `rest`, which is a property of its own. A new `trigger` (or `focus`) takes over at once, and what pointed at it under the old one lets go. `IndicatorSettings`.
  - Morph: its `spring` and callbacks; new springs take the next flight. `MorphSettings`.
- c80a491: React: `@fluidkit/lift/react` and `@fluidkit/indicator/react`, React an optional peer (18 or later).
  
  - Components by default, composed of parts: `Lift.Root`, `Lift.Target`, `Lift.Menu`, `Lift.Item`, `Lift.Separator`, `Lift.Preview`; `Indicator.Root`, `Indicator.Thumb`, `Indicator.Item`. Each part renders as an element of yours with `render`, as in Base UI (`render={<img src={src} />}`, or a function of its props and state), our props merged into it. Headless: their state is in data attributes (`data-state`, `data-selected`, `data-active`, `data-disabled`) for any CSS.
  - Controlled or not: `open` / `defaultOpen` / `onOpenChange` for a lift; `value` / `defaultValue` / `onValueChange` for an indicator, and `active` for an item pointed at from elsewhere (the finger on a lift's menu, say). A lift's items have values, `onSelect` on the root is given the one chosen, and an item's own `onSelect` can `preventDefault()` to keep the menu open.
  - Hooks for markup of your own: `useLift()` and `useIndicator()` give refs to bind the engine to your elements, its state and the engine itself.
  - An engine is made once its elements are in the page and given new props by `set()`, never made again for them; callbacks are always the latest. Strict mode, React 18's and 19's refs, server rendering and unmounting while a lift is open all work.
  - `@fluidkit/core/react`: what the adapters are made of (`renderPart`, `mergeProps`, `useMergedRefs`, `useAttach`, `useControllable`, `useSettings`…), for a component of your own.

### Patch Changes

- Updated dependencies [c80a491]
  - @fluidkit/core@1.4.0

## 1.0.3

### Patch Changes

- 8a34144: Resting on an item that grows or shrinks (its text animating, say), the indicator keeps to it frame by frame instead of chasing it on a spring a few frames behind. And it's no longer a fraction of a pixel off its item in a container whose width isn't a whole number: `offsetWidth` is rounded, and was taken for a scale.
- Updated dependencies [8c0c800]
  - @fluidkit/core@1.3.0

## 1.0.2

### Patch Changes

- e5f6f44: No text on the page is selected while a gesture holds a pointer: a drag (from the pointer going down on the handle until it's let go, given up or not), glass pressed to stretch, and a press dragged across an indicator's items.
- Updated dependencies [835066d]
  - @fluidkit/core@1.2.0

## 1.0.1

### Patch Changes

- 73190c8: A release over another item drops only the browser's own click that follows it, through core's `swallowClick`, and no longer any other click in the next 400ms.
- Updated dependencies [73190c8]
  - @fluidkit/core@1.1.0

## 1.0.0

First release.

- One element that flies onto an item of a container: `createIndicator({ container, indicator })`, its center, size and corners on interruptible springs that keep their velocity, without overshoot by default, a few frames from item to item.
- Item to item, never in between: over a gap or a separator it stays on the last item, and crosses to the next blurred and a little fainter by its own speed. It shows up on its item at once; going away, it fades as it lands on the item it was headed for, so a pointer swept past leaves it on the last item it was over. Over a disabled item it goes away.
- `trigger`: hover for a mouse or a pen and press for a finger, per event (`auto`), or `hover`, `press`, `manual`. A press shows after a short delay on touch, so a finger that lands to scroll shows nothing; released over another item, that item is clicked (`click`). Keyboard focus that shows moves it too (`focus`).
- `data-pressed` on the indicator while a pointer is down on its item (a press, or a click on the hovered one), for the page to style.
- `rest`, where it stays when nothing points, such as the chosen tab; `to()`, `current`, `update()`, `destroy()`; partial springs; `onChange`.
- Each item lends it its corners, circular and fitted as the browser draws them; corner shapes where `corner-shape` is supported. An item with square corners lends it the indicator's own.
- Items are measured at rest, in the indicator's own pixels (a scaled container works), and again when anything in the container is resized or changed; pointers are hit-tested against those boxes, without layout. Reduced motion moves it at once.
- ESM with TypeScript declarations. Depends on `@fluidkit/core`.

### Compatibility

- The container needs a position of its own, and the indicator has to be under the items (an isolated container and `z-index: -1`, or positioned items). Rotated ancestors aren't supported.
- For a press to drag across items, give the container `touch-action: none` and `user-select: none`. A press the browser takes over (a drag of selected text) ends without a choice.

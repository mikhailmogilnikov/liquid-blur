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

- 54cc634: Vue components and composables: `@fluidkit/morph/vue`, `@fluidkit/drag/vue` and `@fluidkit/blur/vue`. Vue is an optional peer dependency (3.5+).
  
  - Morph: `Morph.Root` (`v-model`, `@start`, `@rest`, `@progress`), `Morph.State`, `Morph.Trigger`, `Morph.Match`, plus `useMorph()`. A state becomes a trigger with `as-child`. The animation starts after the new value renders, so labels and matches changed by the same click animate correctly. States added or removed later are handled automatically.
  - Drag: `Drag.Root` (`v-model:snap`, `@start`, `@move`, `@end`, `@rest`), `Drag.Handle`, `Drag.Scroll`, plus `useDrag()`. Snap points and bounds can be a function of the parent's size, recomputed on resize and when what they use changes. If the parent keeps `snap` unchanged, the element goes back to it.
  - Blur: `Glass` with variants as props, which sets up press effects automatically, and `Glass.Group` for glass groups. Also `glass()` (returns `{ class, style }` for `v-bind`), `usePress()` and `useGlassGroup()`.

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
- 96ccb94: React components and hooks: `@fluidkit/morph/react`, `@fluidkit/drag/react` and `@fluidkit/blur/react`. React is an optional peer dependency (18+).
  
  - Morph: `Morph.Root`, `Morph.State`, `Morph.Trigger` and `Morph.Match`, plus `useMorph()`. States have a `value` (`value` / `defaultValue` / `onValueChange`), and callbacks receive values instead of elements. A state can also be a trigger via `render`. The animation starts after the new value renders, so labels and matches changed by the same click animate correctly. States added or removed later are handled automatically.
  - Drag: `Drag.Root`, `Drag.Handle` and `Drag.Scroll`, plus `useDrag()`. Snap points and bounds can be a function of the parent's size, recomputed on resize and re-render. `snap` / `defaultSnap` / `onSnapChange`; if the parent keeps `snap` unchanged, the element goes back to it.
  - Blur: `Glass` with variants as props (`clear`, `tint`, `lens`, `transparency`, `depth`, `interactive`, `highlight`, `swell`, `stretch`), which sets up press effects automatically, and `Glass.Group` for glass groups. Also `glass()`, `usePress()` and `useGlassGroup()`.

### Patch Changes

- Updated dependencies [c80a491]
  - @fluidkit/core@1.4.0

## 1.0.1

### Patch Changes

- 875cd45: A state that's a popover keeps its surface on the way: the shape's fill and the copies no longer take its `popover` attribute, which hid them (a popover that isn't open is `display: none`).

## 1.0.0

First release.

- One element flows into another: `createMorph({ states })` and `to(state)`, between any of its states, with independent springs for center, size and progress, interruptible with the velocity kept. Sent back mid-way it turns around; sent elsewhere, it starts over from where the shape is.
- The bigger state flies itself, live the whole way (pressed, typed into, playing), through transform, opacity, filter and clip-path; the smaller one rides in the shape as a copy. A translation of the bigger state's own (`translate: -50% -50%`) is kept.
- Shared elements: pieces marked with the same `data-fk-match` in two states fly from one to the other.
- Works on any element: the shape takes the states' surfaces, and where they differ one dissolves into the other. With `@fluidkit/blur` it's the same glass, and inside a glass group it lifts over the group or melts with it, through the Fluid Kit DOM contract.
- Each corner goes from one state's radius to the other's, circular all the way; corner shapes interpolate as a superellipse where `corner-shape` is supported.
- Follows scrolling, window resizes and the states' own size changes during a flight; `update()` for any other move.
- The bigger state, coming in magnified, doesn't widen the page on its way: the nearest element spanning the page clips sideways while it flies (iOS Safari pans past the body's own `overflow`).
- A state that holds focus as it goes stays focusable and readable (`opacity: 0`, `data-fk-away`); pressing the shape on its way presses the state under it.
- `current`, `moving`, a promise from `to()`; `{ instant: true }`; `initial`; `onStart`, `onRest` and a per-frame `onProgress`; `add()` and `remove()` for states that come and go; partial `grow` and `shrink` springs; a `container` for the shape out of a clipping parent.
- ESM with TypeScript declarations. Depends on `@fluidkit/core`.

### Compatibility

- Create morphs after mounting or hydration. Rotated or scaled ancestors aren't supported, nor a transform of the bigger state's own other than a translation.

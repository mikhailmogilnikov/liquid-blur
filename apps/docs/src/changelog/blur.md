# Changelog

## 1.6.2

### Patch Changes

- 9c942cc: Scroll edges (`lb-edge`, `lb-edge-x`) show in minified builds. Given `animation` and `animation-timeline`, Lightning CSS (Vite's minifier) folded the timeline into the shorthand, which browsers reject, so the fade never showed; the animation is now written in longhands.

## 1.6.1

### Patch Changes

- 7652eba: `Glass` from `@fluidkit/blur/vue` type-checks in an app that checks libraries (`skipLibCheck: false`): its declaration no longer spells out Vue's instance type, which `vue-tsc` rejected.

## 1.6.0

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

## 1.5.0

### Minor Changes

- 54cc634: Vue components and composables: `@fluidkit/morph/vue`, `@fluidkit/drag/vue` and `@fluidkit/blur/vue`. Vue is an optional peer dependency (3.5+).
  
  - Morph: `Morph.Root` (`v-model`, `@start`, `@rest`, `@progress`), `Morph.State`, `Morph.Trigger`, `Morph.Match`, plus `useMorph()`. A state becomes a trigger with `as-child`. The animation starts after the new value renders, so labels and matches changed by the same click animate correctly. States added or removed later are handled automatically.
  - Drag: `Drag.Root` (`v-model:snap`, `@start`, `@move`, `@end`, `@rest`), `Drag.Handle`, `Drag.Scroll`, plus `useDrag()`. Snap points and bounds can be a function of the parent's size, recomputed on resize and when what they use changes. If the parent keeps `snap` unchanged, the element goes back to it.
  - Blur: `Glass` with variants as props, which sets up press effects automatically, and `Glass.Group` for glass groups. Also `glass()` (returns `{ class, style }` for `v-bind`), `usePress()` and `useGlassGroup()`.

### Patch Changes

- Updated dependencies [54cc634]
  - @fluidkit/core@1.5.0

## 1.4.0

### Minor Changes

- 96ccb94: React components and hooks: `@fluidkit/morph/react`, `@fluidkit/drag/react` and `@fluidkit/blur/react`. React is an optional peer dependency (18+).
  
  - Morph: `Morph.Root`, `Morph.State`, `Morph.Trigger` and `Morph.Match`, plus `useMorph()`. States have a `value` (`value` / `defaultValue` / `onValueChange`), and callbacks receive values instead of elements. A state can also be a trigger via `render`. The animation starts after the new value renders, so labels and matches changed by the same click animate correctly. States added or removed later are handled automatically.
  - Drag: `Drag.Root`, `Drag.Handle` and `Drag.Scroll`, plus `useDrag()`. Snap points and bounds can be a function of the parent's size, recomputed on resize and re-render. `snap` / `defaultSnap` / `onSnapChange`; if the parent keeps `snap` unchanged, the element goes back to it.
  - Blur: `Glass` with variants as props (`clear`, `tint`, `lens`, `transparency`, `depth`, `interactive`, `highlight`, `swell`, `stretch`), which sets up press effects automatically, and `Glass.Group` for glass groups. Also `glass()`, `usePress()` and `useGlassGroup()`.

### Patch Changes

- Updated dependencies [c80a491]
  - @fluidkit/core@1.4.0

## 1.3.0

### Minor Changes

- 71fd814: Scroll edge options: `--lb-edge-start` and `--lb-edge-end` size one side's fade (the top or left, the bottom or right), `0px` turning that side's edge off; `--lb-edge-strength` sets how transparent the content gets at the edge, all the way (1) by default.

### Patch Changes

- Updated dependencies [c5ea523]
  - @fluidkit/core@1.2.1

## 1.2.0

### Minor Changes

- 3e6e815: Scroll edges: `lb-edge` on an element that scrolls fades its content out toward its top and bottom, as under the bars in iOS; `lb-edge-x`, toward its sides. An edge shows only while there's content past it, so at either end of the scroll its edge is gone and covers nothing. Pure CSS, a `mask` driven by scroll-driven animations; `--lb-edge-size` (28px) sets how far it reaches. Without scroll-driven animations there are no edges.

### Patch Changes

- e5f6f44: No text on the page is selected while a gesture holds a pointer: a drag (from the pointer going down on the handle until it's let go, given up or not), glass pressed to stretch, and a press dragged across an indicator's items.
- Updated dependencies [835066d]
  - @fluidkit/core@1.2.0

## 1.1.0

### Minor Changes

- 5ab426d: A lens: `lb-lens`, or `--lb-lens` from 0 to 1. The same glass with no blur, so what's under it shows sharp, as a thumb that's held is in iOS. `--lb-lens` is inherited and registered, so it transitions and any selector can set it: `.thumb[data-dragging] { --lb-lens: 1 }` turns a held thumb into a lens and back. `--lb-transparency` is registered now too, so it transitions as well.
- 0321a06: `--lb-stretch-axis`: which way `lb-stretch` pulls, `x`, `y` or `both` (the default), read once per press like `--lb-stretch`. A switch's thumb that stays in its track stretches along `x` only.

## 1.0.0

First release.

- CSS glass material with backdrop blur, saturation, fill, volume, rims, edges and shadows; no refraction.
- Regular, clear and tinted surfaces with inherited controls for transparency, depth, colors and theme.
- Press (`@fluidkit/blur/press`): spring-driven highlight, swell and stretch, for mouse, touch and keyboard; disabled controls (`:disabled`, `aria-disabled="true"`) aren't pressed. `@fluidkit/blur/auto` installs it on import.
- Melt (`@fluidkit/blur/melt`): glass groups that merge nearby rounded shapes into one surface without blurring overlaps twice. The shared glass is clipped and masked to the melted outline, so Chromium on Windows doesn't show a blurred rectangle around it under a rounded, clipping ancestor.
- Meets `@fluidkit/morph` through the Fluid Kit DOM contract (`data-fk-surface`, `data-fk-part`, `data-fk-away`), without importing it.
- Reduced transparency, increased contrast, forced colors and reduced motion support.
- ESM entry points with TypeScript declarations, and a stylesheet declaration for TypeScript's Bundler and NodeNext module resolution. Depends on `@fluidkit/core`.

### Compatibility

- The material requires `backdrop-filter`, `color-mix()` and CSS `pow()`; registered properties have fallbacks. The stylesheet keeps `-webkit-backdrop-filter` for Safari before 18.
- Glass groups require `clip-path: path()` and Canvas 2D.
- Create groups after mounting or hydration.

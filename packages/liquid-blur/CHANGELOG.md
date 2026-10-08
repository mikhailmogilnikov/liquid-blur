# Changelog

## Unreleased

- Morphs close onto the control where it is now: scrolling the page while a panel was open sent it back to the control's old place on screen.
- Open morphs follow the panel: when the content's size or the window changes, the glass takes the new box. `morph.update()` does the same for any other move.
- Morphs add their glass copies next to the control only while the panel is open or moving, so the control's parent keeps its own children at rest and `:last-child` and similar selectors keep matching.
- Morphs keep a translation of the content's own (`translate: -50% -50%`, or as `transform`): a centered panel was offset from its glass at rest and jumped while animating.
- `spring` takes partial sets; anything left out comes from `defaultMorphSprings`.
- `onStart(open)` reports when a morph sets off, so focus can move into the panel without waiting for it to settle.
- Calls on a morph after `destroy()` do nothing.
- Morph controls stay focusable and readable while their panel is out: hidden with `opacity: 0` and marked `data-lb-away` instead of `visibility: hidden`, so `aria-expanded` is read and focus on the control isn't dropped. Glass groups leave children with `data-lb-away` out.
- `container` option: where a morph's glass goes instead of next to the control, out of a parent that clips it.
- Morph corners follow each corner's own radius (a sheet rounded on top only stays square below), and percent radii resolve against the box instead of being read as pixels.
- `update()` mid-morph corrects the flight under way instead of starting a new one, so it doesn't overshoot again.
- `SpringAnimator.retarget(target)`: moves the target of the flight under way, keeping its springs, velocity and settling.
- `morph.phase` (`"closed"`, `"opening"`, `"open"`, `"closing"`); `open()`, `close()` and `toggle()` return a promise of whether they got there.
- `open({ instant: true })` and `close({ instant: true })` swap at once; `initialOpen` starts a morph open, quietly.
- `dismiss` option: closes a morph on Escape and on a press outside the panel and the control.
- A React hook recipe for morphs in the README and docs.
- Glass groups start to melt closer: the default `--lb-merge` is now `18px` (was `24px`).
- Glass groups also mask the shared glass to the melted outline with an inline SVG `<mask>`, on top of its `clip-path`. Inside an ancestor with `overflow: hidden` and `border-radius`, Chromium on Windows clipped the backdrop only to the outline's bounding box, so a blurred rectangle showed around melted glass. The mask alternates between two `<mask>` elements, so browsers repaint it with each new outline, and is set in the glass's box units, so CSS `zoom` doesn't shift it in WebKit.
- A Limitations section in the README and docs collects what the library doesn't support, including an ancestor that clips with a `corner-shape` other than `round`, which still shows that rectangle in Chromium.

## 1.0.0 — 2026-10-08

First stable release.

- CSS glass material with backdrop blur, saturation, fill, volume, rims, edges and shadows; no refraction.
- Regular, clear and tinted surfaces with inherited controls for transparency, depth, colors and theme.
- Spring-driven press highlight, swell and stretch, including mouse, touch and keyboard interaction.
- Glass groups that merge nearby rounded shapes into one surface without blurring overlaps twice.
- Interruptible control-to-panel morphs with independent position, size and progress springs, corner interpolation and group integration.
- Public `SpringAnimator` with shared or per-channel spring settings, velocity-preserving retargeting and optional settling bounce.
- Reduced transparency, increased contrast, forced colors and reduced motion support.
- Separate ESM entry points for manual installation, automatic installation, glass groups and morphs, with TypeScript declarations and no runtime dependencies.
- ESM-compatible declaration imports and a stylesheet declaration for TypeScript's Bundler and NodeNext module resolution.

### Compatibility

- The material requires `backdrop-filter`, `color-mix()` and CSS `pow()`; registered properties have fallbacks.
- Glass groups require `clip-path: path()` and Canvas 2D.
- Morphs use rounded rectangles; corner shapes interpolate only where the browser supports `corner-shape`.
- Create groups and morphs after mounting or hydration. Morph geometry does not support rotated or scaled ancestors, or automatic tracking of layout changes while open.

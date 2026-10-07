# Changelog

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

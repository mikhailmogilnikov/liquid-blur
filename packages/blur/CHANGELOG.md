# Changelog

## 1.0.0

First release.

- CSS glass material with backdrop blur, saturation, fill, volume, rims, edges and shadows; no refraction.
- Regular, clear and tinted surfaces with inherited controls for transparency, depth, colors and theme.
- Press (`@liquid-web/blur/press`): spring-driven highlight, swell and stretch, for mouse, touch and keyboard. `@liquid-web/blur/auto` installs it on import.
- Melt (`@liquid-web/blur/melt`): glass groups that merge nearby rounded shapes into one surface without blurring overlaps twice. The shared glass is clipped and masked to the melted outline, so Chromium on Windows doesn't show a blurred rectangle around it under a rounded, clipping ancestor.
- Meets `@liquid-web/morph` through the liquid-web DOM contract (`data-lw-surface`, `data-lw-part`, `data-lw-away`), without importing it.
- Reduced transparency, increased contrast, forced colors and reduced motion support.
- ESM entry points with TypeScript declarations, and a stylesheet declaration for TypeScript's Bundler and NodeNext module resolution. Depends on `@liquid-web/core`.

### Compatibility

- The material requires `backdrop-filter`, `color-mix()` and CSS `pow()`; registered properties have fallbacks. The stylesheet keeps `-webkit-backdrop-filter` for Safari before 18.
- Glass groups require `clip-path: path()` and Canvas 2D.
- Create groups after mounting or hydration.

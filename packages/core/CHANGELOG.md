# Changelog

## 1.0.0

First release.

- `SpringAnimator`: SwiftUI-style springs (perceptual duration and bounce) over several numeric channels, shared or per channel, solved exactly at any frame rate. `to()` keeps the velocity when retargeting; `retarget()` corrects the flight under way without a second overshoot; an optional `settle` bounce after the first turn.
- The liquid-web DOM contract: `SURFACE`, `PART` and `AWAY` (`data-lw-surface`, `data-lw-part`, `data-lw-away`).
- ESM with TypeScript declarations and no dependencies.

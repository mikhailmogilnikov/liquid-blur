/**
 * Liquid Blur: a glass material as plain CSS classes (`liquid-blur.css`), and modules beside it,
 * each in its own entry and usable alone: `liquid-blur/press`, `liquid-blur/melt`,
 * `liquid-blur/morph`, `liquid-blur/spring`. This entry is press and spring together, as before
 * the modules had entries of their own.
 */
export { installLiquidBlur } from "./interaction.js";
export { SpringAnimator, type SpringConfig, type SpringParams } from "./springAnimator.js";

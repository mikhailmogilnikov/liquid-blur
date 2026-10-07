/**
 * Liquid Blur: a glass material as plain CSS classes plus an optional, framework-agnostic script
 * for press behaviors. Import the stylesheet once (`liquid-blur.css`) and call `installLiquidBlur()`
 * if you use `lb-highlight`, `lb-swell`, `lb-stretch` or `lb-interactive`.
 * Glass groups live in their own entry, `liquid-blur/group`, so they cost nothing unless used.
 */
export { installLiquidBlur } from "./interaction";
export { SpringAnimator, type SpringConfig, type SpringParams } from "./springAnimator";

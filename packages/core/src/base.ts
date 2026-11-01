/**
 * What every engine shares: the spring every moving part runs on, springs and transitions by name
 * (for CSS too), boxes read as the browser draws them, the DOM attributes they recognize each other
 * by, and dropping the click a gesture would make or the text selection it would start.
 */
export { SpringAnimator, type SpringConfig, type SpringParams } from "./springAnimator.js";
export { springCss, springs, transitions, type SpringOptions, type TransitionParams } from "./motion.js";
export {
  cornerOf,
  cornerShapeOf,
  drawsCornerShape,
  fitRadii,
  measureBox,
  px,
  radiiCss,
  radiiOf,
  still,
  type Box,
  type Radii,
} from "./box.js";
export { AWAY, PART, SURFACE } from "./contract.js";
export { swallowClick } from "./click.js";
export { holdSelection } from "./select.js";

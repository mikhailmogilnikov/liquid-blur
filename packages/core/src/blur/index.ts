/**
 * Press: highlight, swell and stretch on `.lb-highlight`, `.lb-swell`, `.lb-stretch` and
 * `.lb-interactive`. The light is drawn by the material; swell and stretch move any element.
 * `@fluidkit/core/auto` installs it on import.
 */
export { installPress } from "./interaction.js";
/**
 * Melt: children of a glass group share one surface of the material, which melts between them
 * where they come close. Draws the material itself, so it needs the stylesheet.
 */
export { createGlassGroup, installGlassGroups, type GlassGroup } from "./group.js";

/**
 * What the modules tell each other through the DOM: attribute names, nothing else. No module
 * imports another; each marks what it does and reads what the others mark, so any one of them
 * works alone and any two work together.
 */

/**
 * On an element that stepped out for a stand-in to take its place (a morph's control while its
 * panel is out): unseen, yet still there to focus and read. A glass group leaves it out.
 */
export const AWAY = "data-lb-away";

/**
 * On an element a module made, not the page: a group's glass and paint, a morph's copies. Not
 * content: a morph doesn't count it as a neighbor, press behaviors don't press it.
 */
export const PART = "data-lb-part";

/**
 * On a root whose children share one surface of glass, while a group runs on it: a morph opening
 * from one of them lifts its glass out over the others, or melts with them.
 */
export const SURFACE = "data-lb-surface";

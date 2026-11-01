/**
 * What Fluid Kit's Svelte components are made of: props merged for a part's `child` snippet,
 * elements that attachments hand over, and settings kept in step with an engine. For its own
 * components; a component of your own can use them too.
 */
export { flag, mergeProps, type ChildProps, type PartProps } from "./props.js";
export { elementRef, syncSettings, type ElementRef } from "./runes.svelte.js";

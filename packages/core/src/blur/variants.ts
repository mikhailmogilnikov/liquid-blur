/** Glass's variants, as `Glass` takes them as props in React and Vue */
export type GlassVariants = {
  /** Clear, for glass over photos and video: at least transparency 1 (`lb-clear`) */
  clear?: boolean;
  /** Its fill is a color: this one, or `--lb-tint` as inherited with `true` (`lb-tinted`) */
  tint?: boolean | string;
  /** A lens: the same glass with no blur, as a held thumb is in iOS (`lb-lens`) */
  lens?: boolean;
  /** 0 opaque, 0.5 the default, 1 clear: fill and blur together (`--lb-transparency`) */
  transparency?: number;
  /** 0 flat, 0.5 the default, 1 pronounced: shade, glow and rims (`--lb-depth`) */
  depth?: number;
  /** Highlight, swell and stretch, the usual set for a button, chip or icon (`lb-interactive`) */
  interactive?: boolean;
  /** Lights up where it's pressed (`lb-highlight`) */
  highlight?: boolean;
  /** Grows while it's pressed, more the smaller it is (`lb-swell`) */
  swell?: boolean;
  /** Pulls toward the finger and stretches along the drag; along `x` or `y` alone if given (`lb-stretch`) */
  stretch?: boolean | "x" | "y";
};

/** The classes and custom properties for these variants */
export function variants(given: GlassVariants = {}): { classes: string; style: Record<string, string | number> } {
  const { clear, tint, lens, transparency, depth, interactive, highlight, swell, stretch } = given;
  const classes = ["lb"];
  if (clear) classes.push("lb-clear");
  if (tint) classes.push("lb-tinted");
  if (lens) classes.push("lb-lens");
  if (interactive) classes.push("lb-interactive");
  if (highlight) classes.push("lb-highlight");
  if (swell) classes.push("lb-swell");
  if (stretch) classes.push("lb-stretch");
  const style: Record<string, string | number> = {};
  if (typeof tint === "string") style["--lb-tint"] = tint;
  if (transparency !== undefined) style["--lb-transparency"] = transparency;
  if (depth !== undefined) style["--lb-depth"] = depth;
  if (stretch === "x" || stretch === "y") style["--lb-stretch-axis"] = stretch;
  return { classes: classes.join(" "), style };
}

/** Whether any of these needs press */
export const presses = ({ interactive, highlight, swell, stretch }: GlassVariants) =>
  !!(interactive || highlight || swell || stretch);

/** A group's own custom properties */
export function groupStyle(transparency?: number, depth?: number, merge?: number) {
  const style: Record<string, string | number> = {};
  if (transparency !== undefined) style["--lb-transparency"] = transparency;
  if (depth !== undefined) style["--lb-depth"] = depth;
  if (merge !== undefined) style["--lb-merge"] = `${merge}px`;
  return style;
}

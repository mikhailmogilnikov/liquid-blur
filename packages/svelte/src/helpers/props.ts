import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

/**
 * Props as a part hands them to its `child` snippet: attributes, handlers and its attachments. Spread
 * onto whatever element you render, so its values are whatever that element's attributes take
 */
export type ChildProps = Record<PropertyKey, any>;

/**
 * A part's props: the element's own attributes, and either `children` inside the part's element or
 * `child`, a snippet that renders an element of yours, spread with the part's `props`, as in bits-ui:
 *
 *   <Lift.Target>
 *     {#snippet child({ props })}<img {...props} src={src} alt="" />{/snippet}
 *   </Lift.Target>
 */
export type PartProps<State extends object = object, Attributes = HTMLAttributes<HTMLElement>> = Omit<
  Attributes,
  "children"
> & {
  /** What's inside the part's own element */
  children?: Snippet;
  /** An element of yours instead of the part's: spread `props` on it */
  child?: Snippet<[{ props: ChildProps } & State]>;
};

const handler = /^on[a-z]/;

/**
 * Props merged in order, later over earlier: classes joined, styles joined, handlers both called
 * (earlier first), attachments all kept (each has a key of its own). `undefined` leaves what's there
 */
export function mergeProps(...all: Array<ChildProps | null | undefined>): ChildProps {
  const out: ChildProps = {};
  for (const props of all) {
    if (!props) continue;
    for (const key of Reflect.ownKeys(props)) {
      const next = props[key];
      if (next === undefined) continue;
      const prev = out[key];
      if (prev === undefined || prev === null) out[key] = next;
      else if (
        typeof key === "string" &&
        handler.test(key) &&
        typeof prev === "function" &&
        typeof next === "function"
      ) {
        const first = prev as (...args: unknown[]) => void;
        const then = next as (...args: unknown[]) => void;
        out[key] = (...args: unknown[]) => {
          first(...args);
          then(...args);
        };
      } else if (key === "class") out[key] = [prev, next];
      else if (key === "style" && typeof prev === "string" && typeof next === "string") out[key] = `${prev}; ${next}`;
      else out[key] = next;
    }
  }
  return out;
}

/** A data attribute that's there or not: `data-x=""` when on, none when off */
export const flag = (on: boolean | undefined) => (on ? "" : undefined);

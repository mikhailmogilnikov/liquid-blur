<!--
  @component
  What moves, laid out where it rests at offset 0: a `div`, or with a `child` snippet an element of
  yours. Marked `data-snap` with the snap point it's at or heads for.

    <Drag.Root bind:snap axis="y" snaps={({ height }) => [0, height / 2, height - 76]}>
      <Drag.Handle class="grabber" />
      <Drag.Scroll>…</Drag.Scroll>
    </Drag.Root>
-->
<script lang="ts">
  import { createAttachmentKey } from "svelte/attachments";
  import type { DragAxis, DragBounds, DragPoint, DragSnaps, SpringParams } from "@fluidkit/core";
  import { mergeProps, type PartProps } from "../helpers/index.js";
  import { setDragContext, type DragState } from "./context.js";
  import { useDrag, type Given } from "./use-drag.svelte.js";

  type Props = PartProps<DragState> & {
    /** Along `x`, `y`, or `both` (the default) */
    axis?: DragAxis;
    /** Where it may come to rest; a function of the room it's in is read again on a resize */
    snaps?: Given<DragSnaps>;
    /** How far it moves before it's rubber; the farthest snap points unless given */
    bounds?: Given<DragBounds>;
    /** The snap point it's at: controlled, with `bind:snap`. Without it, it's its own */
    snap?: number;
    /** The snap point it starts at, when it's its own */
    defaultSnap?: number;
    /** Not dragged while true */
    disabled?: boolean;
    /** How hard it pulls back past its bounds: 0.55 unless given */
    rubberband?: number;
    /** How quickly a flick would slow down, per millisecond: 0.998 unless given */
    deceleration?: number;
    /** The spring it settles on */
    spring?: SpringParams;
    /** A spring it chases the pointer on while dragged */
    follow?: SpringParams;
    /** Let go heading for another snap point */
    onSnapChange?: (snap: number) => void;
    /** A pointer starts dragging it, or catches it on its way */
    onStart?: () => void;
    /** Every frame it moves: its offset and speed, px/s */
    onMove?: (position: DragPoint, velocity: DragPoint) => void;
    /** Let go, heading for this snap point (`null` with none) */
    onEnd?: (snap: number | null) => void;
    /** It has come to rest */
    onRest?: () => void;
  };

  let {
    axis,
    snaps,
    bounds,
    snap = $bindable(),
    defaultSnap,
    disabled = false,
    rubberband,
    deceleration,
    spring,
    follow,
    onSnapChange,
    onStart,
    onMove,
    onEnd,
    onRest,
    child,
    children,
    ...rest
  }: Props = $props();

  const drag = useDrag(() => ({
    axis,
    snaps,
    bounds,
    snap,
    defaultSnap,
    disabled,
    rubberband,
    deceleration,
    spring,
    follow,
    onSnapChange: (next) => {
      snap = next;
      onSnapChange?.(next);
    },
    onStart: () => onStart?.(),
    onMove: (position, velocity) => onMove?.(position, velocity),
    onEnd: (index) => onEnd?.(index),
    onRest: () => onRest?.(),
  }));
  setDragContext(drag);

  const attach = createAttachmentKey();
  const merged = $derived(mergeProps(rest, { [attach]: drag.element, "data-snap": drag.snap }));
</script>

{#if child}
  {@render child({ props: merged, snap: drag.snap, dragging: drag.dragging })}
{:else}
  <div {...merged}>{@render children?.()}</div>
{/if}

<script lang="ts">
  import { Lift, type LiftSelectEvent } from "../../../src/lift/index.js";

  let {
    open = $bindable(),
    itemSelect,
    onOpenChange,
    onSelect,
  }: {
    open?: boolean;
    itemSelect?: (event: LiftSelectEvent) => void;
    onOpenChange?: (open: boolean) => void;
    onSelect?: (value: string, item: HTMLElement) => void;
  } = $props();
</script>

<Lift.Root bind:open {onOpenChange} {onSelect}>
  <Lift.Target data-testid="photo" tabindex={0} />
  <Lift.Menu aria-label="Photo" data-testid="menu">
    <Lift.Item value="copy">Copy</Lift.Item>
    <Lift.Item value="share" onSelect={itemSelect}>Share</Lift.Item>
    <Lift.Separator />
    <Lift.Item value="delete" disabled>Delete</Lift.Item>
  </Lift.Menu>
</Lift.Root>

<script lang="ts">
  import { useLift } from "../../../src/lift/index.js";

  let { delay, label, engines }: { delay: number; label: string; engines: Set<unknown> } = $props();
  const calls: string[] = [];
  export { calls };

  const lift = useLift(() => ({ delay, onSelect: () => void calls.push(label) }));
  $effect(() => {
    if (lift.lift) engines.add(lift.lift);
  });
</script>

<div>
  <div {@attach lift.element} data-testid="el"></div>
  <div>
    <div {@attach lift.menu} role="menu" hidden><button role="menuitem">A</button></div>
  </div>
</div>

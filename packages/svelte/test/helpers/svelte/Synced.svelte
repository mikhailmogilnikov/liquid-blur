<script lang="ts">
  import { untrack } from "svelte";
  import { elementRef, syncSettings } from "../../../src/helpers/index.js";

  let { speed, onSet }: { speed: number; onSet: (settings: { speed?: number }) => void } = $props();

  // An engine made once its element is here, given only what changed after
  const el = elementRef();
  const taken: { current: { speed: number } | null } = { current: null };
  let engine = $state.raw<{ set(settings: { speed?: number }): void } | null>(null);
  $effect(() => {
    if (!el.current) return;
    engine = { set: onSet };
    // Made with the settings of now; not made again as they change
    taken.current = untrack(() => ({ speed }));
    return () => (engine = null);
  });
  syncSettings(
    () => engine,
    () => ({ speed }),
    taken,
  );
</script>

<div {@attach el.attach} data-testid="el"></div>

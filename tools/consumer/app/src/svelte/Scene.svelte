<script lang="ts">
  import { Glass, glass, Drag, useDrag, Indicator, useIndicator, transitions, Layout, Lift, useLift, Morph, useMorph } from "@fluidkit/svelte";

  let { log }: { log: (line: string) => void } = $props();

  let open = $state(false);
  let tab = $state("overview");
  let view = $state("button");
  let snap = $state(1);
  let rows = $state(["One", "Two", "Three"]);
  let added = 0;

  const lift = useLift(() => ({ onSelect: (item) => log(`own select ${item.dataset.v}`) }));
  const tabs = useIndicator<"a" | "b">(() => ({ trigger: "press", defaultValue: "a" }));
  const own = useMorph(() => ({ defaultValue: "a", onRest: (at) => log(`own rest ${at}`) }));
  const card = useDrag(() => ({ axis: "x", snaps: [0, 120], onSnapChange: (s) => log(`own snap ${s}`) }));
</script>

<section>
  <Lift.Root bind:open onSelect={(value) => log(`select ${value}`)}>
    <Lift.Target>
      {#snippet child({ props })}<div {...props} class="photo" data-testid="photo"></div>{/snippet}
    </Lift.Target>
    <Lift.Menu class="menu">
      <Lift.Item value="copy" data-testid="lift-copy">Copy</Lift.Item>
      <Lift.Item value="share">Share</Lift.Item>
    </Lift.Menu>
  </Lift.Root>
  <output data-testid="lift-open">{open}</output>
</section>

<section>
  <div {@attach lift.element} class="card" data-testid="own-lift">
    Own lift <span data-testid="own-lift-state">{lift.opened ? "open" : "closed"}</span>
  </div>
  <div {@attach lift.menu} role="menu" hidden class="menu">
    <button role="menuitem" data-v="x">X</button>
  </div>
</section>

<section>
  <Indicator.Root bind:value={tab} trigger="press" class="tabs">
    <Indicator.Thumb class="thumb" data-testid="thumb" />
    <Indicator.Item value="overview">Overview</Indicator.Item>
    <Indicator.Item value="releases" data-testid="tab-releases">Releases</Indicator.Item>
    <Indicator.Item value="audience">
      {#snippet child({ props })}<a {...props} href="#audience" data-testid="tab-audience">Audience</a>{/snippet}
    </Indicator.Item>
  </Indicator.Root>
  <output data-testid="tab">{tab}</output>
</section>

<section>
  <div {@attach tabs.container} class="tabs">
    <span {@attach tabs.indicator} class="thumb" data-testid="own-thumb"></span>
    <button {@attach tabs.item("a")}>A</button>
    <button {@attach tabs.item("b")} data-testid="own-tab-b">B</button>
  </div>
  <output data-testid="own-tab">{tabs.value}</output>
</section>

<section class="stage">
  <Morph.Root bind:value={view} onRest={(at) => log(`rest ${at}`)}>
    <Morph.State value="button">
      {#snippet child({ props })}
        <Morph.Trigger {...props} value="panel" class="pill" data-testid="more">
          <Morph.Match name="label">More</Morph.Match>
        </Morph.Trigger>
      {/snippet}
    </Morph.State>
    <Morph.State value="panel" class="panel" data-testid="panel">
      <Morph.Match name="label">More</Morph.Match>
      <Morph.Trigger value="button" data-testid="close">Close</Morph.Trigger>
    </Morph.State>
  </Morph.Root>
  <output data-testid="view">{view}</output>
</section>

<section class="stage">
  <button {@attach own.state("a")} class="pill" data-testid="own-a" onclick={() => own.to("b")}>A</button>
  <div {@attach own.state("b")} class="panel">
    <button data-testid="own-back" onclick={() => own.to("a")}>Back</button>
  </div>
</section>

<section>
  <div class="room">
    <Drag.Root
      bind:snap
      axis="y"
      snaps={({ height }) => [0, height / 2, height - 60]}
      class="sheet"
      data-testid="sheet"
    >
      <Drag.Handle class="grabber" data-testid="grabber" />
    </Drag.Root>
  </div>
  <output data-testid="snap">{snap}</output>
  <button data-testid="snap0" onclick={() => (snap = 0)}>Top</button>
</section>

<section class="track">
  <div {@attach card.element} class="card" data-testid="card">Card</div>
</section>

<section>
  <button data-testid="layout-add" onclick={() => (rows = [`New ${++added}`, ...rows])}>Add</button>
  <button data-testid="layout-drop" onclick={() => (rows = rows.slice(1))}>Drop</button>
  <Layout.Root enter={transitions.blurReplace()}>
    {#snippet child({ props })}
      <ul {...props} data-testid="layout">
        {#each rows as row (row)}<li>{row}</li>{/each}
      </ul>
    {/snippet}
  </Layout.Root>
  <p data-testid="toast" class="fk-transition fk-move" hidden>Saved</p>
</section>

<section class="glassy">
  <Glass interactive tint="#0a84ff" class="mine">
    {#snippet child({ props })}<button {...props} data-testid="glass-button">Follow</button>{/snippet}
  </Glass>
  <Glass.Group merge={24} data-testid="group">
    <Glass>A</Glass>
    <Glass>B</Glass>
  </Glass.Group>
  <div {...glass({ highlight: true, transparency: 1 })} data-testid="own-glass">Own</div>
</section>

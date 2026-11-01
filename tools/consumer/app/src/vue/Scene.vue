<script setup lang="ts">
import { ref } from "vue";
import {
  Glass,
  glass,
  Drag,
  useDrag,
  Indicator,
  useIndicator,
  transitions,
  Layout,
  Lift,
  useLift,
  Morph,
  useMorph,
} from "@fluidkit/vue";

const { log } = defineProps<{ log: (line: string) => void }>();

const open = ref(false);
const tab = ref("overview");
const view = ref("button");
const snap = ref(1);
const rows = ref(["One", "Two", "Three"]);
let added = 0;

const lift = useLift({ onSelect: (item) => log(`own select ${item.dataset.v}`) });
const tabs = useIndicator<"a" | "b">({ trigger: "press", defaultValue: "a" });
const own = useMorph({ defaultValue: "a", onRest: (at) => log(`own rest ${at}`) });
const card = useDrag({ axis: "x", snaps: [0, 120], onSnapChange: (s) => log(`own snap ${s}`) });
</script>

<template>
  <section>
    <Lift.Root v-model:open="open" @select="(value) => log(`select ${value}`)">
      <Lift.Target as-child><div class="photo" data-testid="photo" /></Lift.Target>
      <Lift.Menu class="menu">
        <Lift.Item value="copy" data-testid="lift-copy">Copy</Lift.Item>
        <Lift.Item value="share">Share</Lift.Item>
      </Lift.Menu>
    </Lift.Root>
    <output data-testid="lift-open">{{ open }}</output>
  </section>

  <section>
    <div :ref="lift.element" class="card" data-testid="own-lift">
      Own lift <span data-testid="own-lift-state">{{ lift.opened.value ? "open" : "closed" }}</span>
    </div>
    <div :ref="lift.menu" role="menu" hidden class="menu">
      <button role="menuitem" data-v="x">X</button>
    </div>
  </section>

  <section>
    <Indicator.Root v-model="tab" trigger="press" class="tabs">
      <Indicator.Thumb class="thumb" data-testid="thumb" />
      <Indicator.Item value="overview">Overview</Indicator.Item>
      <Indicator.Item value="releases" data-testid="tab-releases">Releases</Indicator.Item>
      <Indicator.Item value="audience" as-child>
        <a href="#audience" data-testid="tab-audience">Audience</a>
      </Indicator.Item>
    </Indicator.Root>
    <output data-testid="tab">{{ tab }}</output>
  </section>

  <section>
    <div :ref="tabs.container" class="tabs">
      <span :ref="tabs.indicator" class="thumb" data-testid="own-thumb" />
      <button :ref="tabs.item('a')">A</button>
      <button :ref="tabs.item('b')" data-testid="own-tab-b">B</button>
    </div>
    <output data-testid="own-tab">{{ tabs.value.value }}</output>
  </section>

  <section class="stage">
    <Morph.Root v-model="view" @rest="(at) => log(`rest ${at}`)">
      <Morph.State value="button" as-child>
        <Morph.Trigger value="panel" class="pill" data-testid="more">
          <Morph.Match name="label">More</Morph.Match>
        </Morph.Trigger>
      </Morph.State>
      <Morph.State value="panel" class="panel" data-testid="panel">
        <Morph.Match name="label">More</Morph.Match>
        <Morph.Trigger value="button" data-testid="close">Close</Morph.Trigger>
      </Morph.State>
    </Morph.Root>
    <output data-testid="view">{{ view }}</output>
  </section>

  <section class="stage">
    <button :ref="own.state('a')" class="pill" data-testid="own-a" @click="own.to('b')">A</button>
    <div :ref="own.state('b')" class="panel">
      <button data-testid="own-back" @click="own.to('a')">Back</button>
    </div>
  </section>

  <section>
    <div class="room">
      <Drag.Root
        v-model:snap="snap"
        axis="y"
        :snaps="({ height }) => [0, height / 2, height - 60]"
        class="sheet"
        data-testid="sheet"
      >
        <Drag.Handle class="grabber" data-testid="grabber" />
      </Drag.Root>
    </div>
    <output data-testid="snap">{{ snap }}</output>
    <button data-testid="snap0" @click="snap = 0">Top</button>
  </section>

  <section class="track">
    <div :ref="card.element" class="card" data-testid="card">Card</div>
  </section>

  <section>
    <button data-testid="layout-add" @click="rows = [`New ${++added}`, ...rows]">Add</button>
    <button data-testid="layout-drop" @click="rows = rows.slice(1)">Drop</button>
    <Layout.Root :enter="transitions.blurReplace()" as-child>
      <ul data-testid="layout">
        <li v-for="row in rows" :key="row">{{ row }}</li>
      </ul>
    </Layout.Root>
    <p data-testid="toast" class="fk-transition fk-move" hidden>Saved</p>
  </section>

  <section class="glassy">
    <Glass interactive tint="#0a84ff" class="mine" as-child>
      <button data-testid="glass-button">Follow</button>
    </Glass>
    <Glass.Group :merge="24" data-testid="group">
      <Glass>A</Glass>
      <Glass>B</Glass>
    </Glass.Group>
    <div v-bind="glass({ highlight: true, transparency: 1 })" data-testid="own-glass">Own</div>
  </section>
</template>

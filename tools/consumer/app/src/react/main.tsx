import "@fluidkit/react/style.css";
import "../scene.css";
import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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
} from "@fluidkit/react";

type Log = (line: string) => void;

function Scene({ log }: { log: Log }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState("button");
  const [snap, setSnap] = useState(1);
  const [rows, setRows] = useState(["One", "Two", "Three"]);
  const added = useRef(0);

  const lift = useLift({ onSelect: (item) => log(`own select ${item.dataset.v}`) });
  const tabs = useIndicator<"a" | "b">({ trigger: "press", defaultValue: "a" });
  const own = useMorph({ defaultValue: "a", onRest: (at) => log(`own rest ${at}`) });
  const card = useDrag({ axis: "x", snaps: [0, 120], onSnapChange: (s) => log(`own snap ${s}`) });

  return (
    <>
      <section>
        <Lift.Root open={open} onOpenChange={setOpen} onSelect={(value) => log(`select ${value}`)}>
          <Lift.Target render={<div className="photo" data-testid="photo" />} />
          <Lift.Menu className="menu">
            <Lift.Item value="copy" data-testid="lift-copy">
              Copy
            </Lift.Item>
            <Lift.Item value="share">Share</Lift.Item>
          </Lift.Menu>
        </Lift.Root>
        <output data-testid="lift-open">{String(open)}</output>
      </section>

      <section>
        <div ref={lift.element} className="card" data-testid="own-lift">
          Own lift <span data-testid="own-lift-state">{lift.opened ? "open" : "closed"}</span>
        </div>
        <div ref={lift.menu} role="menu" hidden className="menu">
          <button role="menuitem" data-v="x">
            X
          </button>
        </div>
      </section>

      <section>
        <Indicator.Root value={tab} onValueChange={setTab} trigger="press" className="tabs">
          <Indicator.Thumb className="thumb" data-testid="thumb" />
          <Indicator.Item value="overview">Overview</Indicator.Item>
          <Indicator.Item value="releases" data-testid="tab-releases">
            Releases
          </Indicator.Item>
          <Indicator.Item value="audience" render={<a href="#audience" data-testid="tab-audience" />}>
            Audience
          </Indicator.Item>
        </Indicator.Root>
        <output data-testid="tab">{tab}</output>
      </section>

      <section>
        <div ref={tabs.container} className="tabs">
          <span ref={tabs.indicator} className="thumb" data-testid="own-thumb" />
          <button ref={tabs.item("a")}>A</button>
          <button ref={tabs.item("b")} data-testid="own-tab-b">
            B
          </button>
        </div>
        <output data-testid="own-tab">{tabs.value}</output>
      </section>

      <section className="stage">
        <Morph.Root value={view} onValueChange={setView} onRest={(at) => log(`rest ${at}`)}>
          <Morph.State value="button" render={<Morph.Trigger value="panel" className="pill" data-testid="more" />}>
            <Morph.Match name="label">More</Morph.Match>
          </Morph.State>
          <Morph.State value="panel" className="panel" data-testid="panel">
            <Morph.Match name="label">More</Morph.Match>
            <Morph.Trigger value="button" data-testid="close">
              Close
            </Morph.Trigger>
          </Morph.State>
        </Morph.Root>
        <output data-testid="view">{view}</output>
      </section>

      <section className="stage">
        <button ref={own.state("a")} className="pill" data-testid="own-a" onClick={() => own.to("b")}>
          A
        </button>
        <div ref={own.state("b")} className="panel">
          <button data-testid="own-back" onClick={() => own.to("a")}>
            Back
          </button>
        </div>
      </section>

      <section>
        <div className="room">
          <Drag.Root
            snap={snap}
            onSnapChange={setSnap}
            axis="y"
            snaps={({ height }) => [0, height / 2, height - 60]}
            className="sheet"
            data-testid="sheet"
          >
            <Drag.Handle className="grabber" data-testid="grabber" />
          </Drag.Root>
        </div>
        <output data-testid="snap">{snap}</output>
        <button data-testid="snap0" onClick={() => setSnap(0)}>
          Top
        </button>
      </section>

      <section className="track">
        <div ref={card.element} className="card" data-testid="card">
          Card
        </div>
      </section>

      <section>
        <button data-testid="layout-add" onClick={() => setRows((r) => [`New ${++added.current}`, ...r])}>
          Add
        </button>
        <button data-testid="layout-drop" onClick={() => setRows((r) => r.slice(1))}>
          Drop
        </button>
        <Layout.Root enter={transitions.blurReplace()} render={<ul data-testid="layout" />}>
          {rows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </Layout.Root>
        <p data-testid="toast" className="fk-transition fk-move" hidden>
          Saved
        </p>
      </section>

      <section className="glassy">
        <Glass interactive tint="#0a84ff" className="mine" render={<button data-testid="glass-button" />}>
          Follow
        </Glass>
        <Glass.Group merge={24} data-testid="group">
          <Glass>A</Glass>
          <Glass>B</Glass>
        </Glass.Group>
        <div {...glass({ highlight: true, transparency: 1 })} data-testid="own-glass">
          Own
        </div>
      </section>
    </>
  );
}

function App() {
  const [shown, setShown] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const log: Log = (line) => setLines((all) => [...all, line]);
  return (
    <>
      <button data-testid="toggle" onClick={() => setShown(!shown)}>
        Toggle
      </button>
      <pre data-testid="log">{lines.join("\n")}</pre>
      {shown && <Scene log={log} />}
    </>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

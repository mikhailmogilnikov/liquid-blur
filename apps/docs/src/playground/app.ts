import { SpringAnimator, installGlassGroups } from "@fluidkit/core";
import { segmented } from "../scripts/segmented";
import { CASES, PACKAGES, type CaseMeta } from "./cases";
import type { Kit, Run, Setup } from "./kit";
import { settle } from "./check";
import { debugOverlay } from "./debug";
import { blur } from "./blur";
import { morph } from "./morph";
import { indicator } from "./indicator";
import { drag } from "./drag";
import { layout } from "./layout";
import { lift } from "./lift";
import { motion } from "./motion";

/**
 * The playground: one case on the stage at a time, cloned fresh from its template, set up by its
 * package's script, and torn down when another is opened. The step bar runs its steps in turn.
 */
installGlassGroups();

const setups: Record<string, Setup> = { ...blur, ...morph, ...indicator, ...drag, ...lift, ...layout, ...motion };
const page = document.querySelector<HTMLElement>("[data-pg]")!;
const $ = <T extends Element = HTMLElement>(name: string) => page.querySelector<T>(`[data-pg-${name}]`)!;

const stage = $("stage");
const mount = $("mount");
const backdrop = $("backdrop");
const side = $<HTMLDetailsElement>("side");
const bar = $("next").parentElement!;
const phone = matchMedia("(max-width: 860px)");

// ── Settings, remembered ──

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("fk-playground") ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
})();
const remember = (key: string, value: string) => {
  saved[key] = value;
  try {
    localStorage.setItem("fk-playground", JSON.stringify(saved));
  } catch {}
};

// ── Speed: every spring through core, CSS transitions and animations through their playback rate ──

let speed = 1;
const rate = (animation: Animation) => {
  animation.playbackRate = speed;
};
const setSpeed = (value: number, keep = true) => {
  speed = value;
  SpringAnimator.timeScale = value;
  for (const animation of document.getAnimations()) rate(animation);
  if (keep) remember("speed", String(value));
};
// New ones as they start: a glass's press, a stripe's slide
for (const type of ["transitionrun", "animationstart"]) {
  document.addEventListener(
    type,
    (e) => {
      for (const animation of (e.target as Element).getAnimations?.() ?? []) rate(animation);
    },
    true,
  );
}
const speedControl = segmented($("speed"), (v) => setSpeed(Number(v)));
const speedLabel = () => ({ 1: "real time", 0.25: "slow (×4)", 0.1: "slower (×10)" })[speed] ?? `×${speed}`;

// ── Backdrop ──

let bg = "aurora";
const setBackdrop = (value: string) => {
  bg = value;
  stage.dataset.bg = value;
  backdrop.className = "pg__backdrop bd";
  if (value === "aurora") backdrop.classList.add("bd-aurora");
  if (value === "stripes") backdrop.classList.add("bd-stripes", "is-live");
  remember("bg", value);
};
const bgControl = segmented($("bg"), setBackdrop);

// ── Debug: the boxes the packages work with, drawn over everything ──

const debug = debugOverlay(mount);
const debugButton = $("debug");
const setDebug = (on: boolean) => {
  debugButton.setAttribute("aria-pressed", String(on));
  debug.toggle(on);
  remember("debug", on ? "1" : "");
};
debugButton.addEventListener("click", () => setDebug(debugButton.getAttribute("aria-pressed") !== "true"));

// ── The case on the stage ──

let meta: CaseMeta = CASES[0];
let run: Run = {};
let step = 0;
let leave: Array<() => void> = [];
let auto = 0;

/** The case's timers still to go off: a check waits for them */
let pending = 0;
const kit = (): Kit => ({
  later(fn, ms) {
    pending++;
    let done = false;
    const id = window.setTimeout(() => {
      done = true;
      pending--;
      fn();
    }, ms / SpringAnimator.timeScale);
    leave.push(() => {
      window.clearTimeout(id);
      if (!done) pending--;
    });
  },
  cleanup(fn) {
    leave.push(fn);
  },
  skip(label) {
    if (meta.steps[step] !== label) return;
    step = (step + 1) % meta.steps.length;
    showStep();
  },
});

const showStep = () => {
  const n = meta.steps.length;
  bar.dataset.steps = String(n);
  $("only").hidden = n > 0;
  $("step").textContent = n ? `${step + 1} / ${n}` : "";
  $("next-label").textContent = meta.steps[step] ?? "";
};

const stopAuto = () => {
  window.clearTimeout(auto);
  auto = 0;
  $("auto").setAttribute("aria-pressed", "false");
};

const teardown = () => {
  stopAuto();
  run.destroy?.();
  for (const fn of leave) fn();
  leave = [];
  run = {};
  mount.replaceChildren();
};

const open = (id: string, focusList = false) => {
  const next = CASES.find((c) => c.id === id) ?? CASES[0];
  const template = page.querySelector<HTMLTemplateElement>(`template[data-case="${next.id}"]`);
  teardown();
  meta = next;
  step = 0;
  if (template) mount.append(template.content.cloneNode(true));
  run = setups[meta.id]?.(mount, kit()) ?? {};

  $("title").textContent = meta.title;
  $("pkg").textContent = PACKAGES.find(([p]) => p === meta.pkg)![1];
  $("tags").replaceChildren(...meta.tags.map((t) => Object.assign(document.createElement("span"), { textContent: t })));
  $("expect").textContent = meta.expect;
  showFailures();
  $("current").textContent = meta.title;
  for (const link of page.querySelectorAll<HTMLAnchorElement>("[data-pg-link]")) {
    if (link.dataset.pgLink === meta.id) {
      link.setAttribute("aria-current", "true");
      if (focusList) link.scrollIntoView({ block: "nearest" });
    } else link.removeAttribute("aria-current");
  }
  showStep();
  if (location.hash.slice(1) !== meta.id) history.replaceState(null, "", `#${meta.id}`);
};

const next = () => {
  if (!meta.steps.length) return;
  run.steps?.[step]?.();
  step = (step + 1) % meta.steps.length;
  showStep();
};

$("next").addEventListener("click", () => {
  stopAuto();
  next();
});
$("reset").addEventListener("click", () => open(meta.id));
// Auto: a step, then the next once it has had time to play out, at the speed it plays at
$("auto").addEventListener("click", () => {
  if (auto) return stopAuto();
  $("auto").setAttribute("aria-pressed", "true");
  const tick = () => {
    next();
    auto = window.setTimeout(tick, 1400 / SpringAnimator.timeScale);
  };
  tick();
});

page.addEventListener("click", (e) => {
  const link = (e.target as Element).closest<HTMLAnchorElement>("[data-pg-link]");
  if (!link) return;
  e.preventDefault();
  open(link.dataset.pgLink!);
  if (phone.matches) side.open = false;
});
addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (id && id !== meta.id) open(id, true);
});

// ── Checks: every case's steps run, and what each should have done checked once it has played out ──

type Result = { id: string; checked: boolean; failures: string[] };
const results = new Map<string, Result>();
const checkButton = $("check");
const checkLabel = $("check-label");

/** The open case's failures, under what it should do */
function showFailures() {
  const list = $("fails");
  const failures = results.get(meta.id)?.failures ?? [];
  list.replaceChildren(...failures.map((f) => Object.assign(document.createElement("li"), { textContent: f })));
  list.hidden = !failures.length;
}

/** Each case's mark in the list: passed, failed, or checks nothing */
const mark = (r: Result) => {
  const link = page.querySelector<HTMLElement>(`[data-pg-link="${r.id}"]`);
  if (link) link.dataset.check = !r.checked ? "none" : r.failures.length ? "fail" : "pass";
};

/** Every case, after every step: the page doesn't scroll sideways (a panel wider than a phone, say) */
const sideways = () => {
  const wide = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return wide > 0 ? `the page scrolls sideways by ${wide}px` : null;
};

async function checkCase(id: string): Promise<Result> {
  open(id);
  // In sight: glass off screen draws nothing and isn't kept up to date (a group's melt), as on a
  // phone, where the stage starts below the fold
  stage.scrollIntoView({ block: "center", behavior: "instant" });
  const failures: string[] = [];
  let checked = false;
  const verdict = (label: string, read: () => string | null | undefined) => {
    try {
      const r = read();
      if (r === undefined) return;
      checked = true;
      if (r) failures.push(`${label}: ${r}`);
    } catch (e) {
      checked = true;
      failures.push(`${label}: threw ${(e as Error).message}`);
    }
  };
  const still = () => settle(mount, () => pending);
  if (!(await still())) failures.push("Start: never came to rest");
  verdict("Start", () => run.check?.(-1));
  verdict("Start", sideways);
  for (let i = 0; i < meta.steps.length; i++) {
    const label = meta.steps[i];
    verdict(label, () => {
      run.steps?.[i]?.();
      return undefined;
    });
    step = (i + 1) % meta.steps.length;
    showStep();
    if (!(await still())) {
      checked = true;
      failures.push(`${label}: never came to rest`);
      continue;
    }
    verdict(label, () => run.check?.(i));
    verdict(label, sideways);
  }
  const result = { id, checked, failures };
  results.set(id, result);
  mark(result);
  return result;
}

/** All of them (or those given), four times as fast, back to the case and speed it started at */
async function checkAll(ids?: string[]) {
  const from = meta.id;
  const was = speed;
  const cases = ids ? CASES.filter((c) => ids.includes(c.id)) : CASES;
  checkButton.setAttribute("aria-busy", "true");
  setSpeed(4, false);
  try {
    for (const [i, c] of cases.entries()) {
      checkLabel.textContent = `Checking ${i + 1} / ${cases.length}`;
      await checkCase(c.id);
    }
  } finally {
    setSpeed(was, false);
    checkButton.removeAttribute("aria-busy");
  }
  const all = [...results.values()].filter((r) => r.checked);
  const passing = all.filter((r) => !r.failures.length).length;
  checkLabel.textContent = `${passing} / ${all.length} passing`;
  checkButton.dataset.state = passing === all.length ? "pass" : "fail";
  // Back where it was, or on the first that failed
  open(all.find((r) => r.failures.length)?.id ?? from, true);
  return cases.map((c) => results.get(c.id)!);
}

checkButton.addEventListener("click", () => {
  if (!checkButton.hasAttribute("aria-busy")) void checkAll();
});
// For CI, which runs them in a browser: `await __playground.checkAll()`, or some of them by id
Object.assign(window, { __playground: { checkAll } });

// ── Search ──

$<HTMLInputElement>("search").addEventListener("input", (e) => {
  const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
  let any = false;
  for (const group of page.querySelectorAll<HTMLElement>("[data-pg-group]")) {
    let shown = 0;
    for (const link of group.querySelectorAll<HTMLElement>("[data-pg-link]")) {
      const match = !q || link.dataset.search!.includes(q);
      link.hidden = !match;
      if (match) shown++;
    }
    group.hidden = !shown;
    any ||= shown > 0;
  }
  $("none").hidden = any;
});

// ── Copy issue: the case, the settings and the browser, ready for a GitHub issue ──

$("copy").addEventListener("click", async () => {
  const theme = document.documentElement.dataset.theme ?? "auto";
  const report = [
    `### Case`,
    ``,
    `${PACKAGES.find(([p]) => p === meta.pkg)![1]}: ${meta.title} (\`${meta.id}\`)`,
    `${location.origin}${location.pathname}#${meta.id}`,
    ``,
    `### What should happen`,
    ``,
    meta.expect,
    ``,
    `### What happens instead`,
    ``,
    ``,
    ``,
    `### Setup`,
    ``,
    meta.steps.length ? `- Step: ${step + 1} / ${meta.steps.length} (next: ${meta.steps[step]})` : `- No steps`,
    `- Speed: ${speedLabel()} · Backdrop: ${bg} · Theme: ${theme} · Debug: ${debug.on ? "on" : "off"}`,
    `- Browser: ${navigator.userAgent}`,
    `- Viewport: ${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    `- Version: ${page.dataset.versions}`,
  ].join("\n");
  const label = $("copy-label");
  try {
    await navigator.clipboard.writeText(report);
    label.textContent = "Copied";
  } catch {
    label.textContent = "Couldn't copy";
  }
  window.setTimeout(() => (label.textContent = "Copy issue"), 1600);
});

// ── Start: what was set last time, the case in the address ──

speedControl.select(saved.speed && ["1", "0.25", "0.1"].includes(saved.speed) ? saved.speed : "1");
bgControl.select(saved.bg ?? "aurora");
setDebug(saved.debug === "1");
if (phone.matches) side.open = false;
open(location.hash.slice(1), true);

import { SpringAnimator, createLayout } from "@fluidkit/core";
import { FRAME, expect, first, sample } from "./check";
import type { Kit, Setup } from "./kit";

/** An element's items as the page has them: not one going out */
const live = (root: HTMLElement) =>
  [...root.children].filter((el) => !el.hasAttribute("data-fk-part")) as HTMLElement[];

/** Nothing of the layout's left on the root and its items at rest, and nothing still going out */
const clean = (root: HTMLElement) => {
  const marked = [root, ...live(root)].find(
    (el) => el.style.transform || el.style.width || el.style.height || el.style.opacity || el.style.position,
  );
  return first(
    // Going out it's inert; a glass group's own parts in the root aren't
    expect(!root.querySelector(":scope > [data-fk-part][inert]"), "something going out is still in the page"),
    expect(!marked, `the layout's styles still on ${marked === root ? "the root" : "an item"}`),
  );
};

/**
 * Watches the items' positions every frame from now on: once read, the biggest step any of them took
 * from one frame to the next, at the springs' own speed. A move on a spring takes small steps (under
 * 20px a frame here); one shown somewhere else at once (a flight started from the wrong place) jumps
 */
const steps = (root: HTMLElement) => {
  const seen = sample(() => ({
    at: performance.now(),
    tops: new Map(live(root).map((el) => [el, el.getBoundingClientRect().top])),
  }));
  return () => {
    seen.stop();
    let worst = 0;
    for (let i = 1; i < seen.seen.length; i++) {
      const { at, tops } = seen.seen[i];
      const last = seen.seen[i - 1];
      // A frame held long (a slow machine's, or a renderer compiling) is a step of several frames
      const frames = Math.max(1, (at - last.at) / FRAME);
      for (const [el, top] of tops) {
        const before = last.tops.get(el);
        if (before !== undefined) worst = Math.max(worst, Math.abs(top - before) / frames);
      }
    }
    return worst / SpringAnimator.timeScale;
  };
};

/** A list of reminders: rows put in, taken out, reversed */
const reminders = (root: HTMLElement) => {
  const list = root.querySelector<HTMLElement>("[data-list]")!;
  let n = 0;
  const add = () => {
    const row = document.createElement("li");
    row.className = "lc-row";
    row.textContent = `New reminder ${++n}`;
    list.insertBefore(row, live(list)[1] ?? null);
  };
  const remove = () => live(list)[1]?.remove();
  const shuffle = () => list.append(...live(list).reverse());
  return { list, add, remove, shuffle };
};

/** Turns a section of settings open or shut */
const toggle = (section: Element, open = !section.classList.contains("open")) => {
  section.classList.toggle("open", open);
  section.querySelector("button")?.setAttribute("aria-expanded", String(open));
};

export const layout: Record<string, Setup> = {
  "layout-list": (root) => {
    const { list, add, remove, shuffle } = reminders(root);
    const l = createLayout({ root: list });
    root.querySelector("[data-add]")!.addEventListener("click", add);
    root.querySelector("[data-remove]")!.addEventListener("click", remove);
    root.querySelector("[data-shuffle]")!.addEventListener("click", shuffle);
    const counts = [5, 4, 4];
    return {
      steps: [add, remove, shuffle],
      check: (step) =>
        first(clean(list), step >= 0 && expect(live(list).length === counts[step], `${live(list).length} rows`)),
      destroy: () => l.destroy(),
    };
  },

  "layout-interrupt": (root, kit: Kit) => {
    const { list, add, shuffle } = reminders(root);
    const l = createLayout({ root: list });
    let worst: (() => number) | null = null;
    return {
      steps: [
        () => {
          worst = steps(list);
          add();
          kit.later(add, 120);
        },
        () => {
          worst = steps(list);
          shuffle();
          kit.later(shuffle, 150);
        },
      ],
      // Sent on mid-way, each row goes on from where it was drawn: no row jumps a frame
      check: (step) => {
        if (step < 0) return clean(list);
        const jump = worst?.() ?? 0;
        return first(clean(list), expect(jump < 30, `a row jumped ${jump.toFixed(0)}px in one frame`));
      },
      destroy: () => l.destroy(),
    };
  },

  "layout-accordion": (root) => {
    const acc = root.querySelector<HTMLElement>("[data-acc]")!;
    const after = root.querySelector<HTMLElement>("[data-after]")!;
    const sections = [...acc.children];
    const l = createLayout({ root: acc });
    for (const s of sections) s.querySelector("button")!.addEventListener("click", () => toggle(s));
    return {
      steps: [
        () => toggle(sections[0], true),
        () => toggle(sections[1], true),
        () => sections.forEach((s) => toggle(s, false)),
      ],
      // At rest what's after the settings is right after them again
      check: () => {
        const gap = after.getBoundingClientRect().top - acc.getBoundingClientRect().bottom;
        return first(clean(acc), expect(Math.abs(gap - 12) < 1, `what's after is ${gap.toFixed(1)}px below, not 12`));
      },
      destroy: () => l.destroy(),
    };
  },

  "layout-grid": (root) => {
    const grid = root.querySelector<HTMLElement>("[data-grid]")!;
    const tiles = [...grid.children] as HTMLElement[];
    const l = createLayout({ root: grid });
    const kept = (kind: string) =>
      tiles.filter((t) => kind === "all" || (kind === "warm") === t.hasAttribute("data-warm"));
    // As a framework would: the ones filtered out taken out of the page, the rest put in order
    const filter = (kind: string) => {
      const keep = kept(kind);
      for (const t of tiles) if (!keep.includes(t) && t.isConnected && !t.hasAttribute("data-fk-part")) t.remove();
      grid.append(...keep);
    };
    for (const b of root.querySelectorAll<HTMLElement>("[data-filter]")) {
      b.addEventListener("click", () => filter(b.dataset.filter!));
    }
    const order = ["warm", "cool", "all"];
    return {
      steps: order.map((kind) => () => filter(kind)),
      check: (step) =>
        first(
          clean(grid),
          step >= 0 &&
            expect(
              live(grid).length === kept(order[step]).length,
              `${live(grid).length} tiles, not ${kept(order[step]).length}`,
            ),
        ),
      destroy: () => l.destroy(),
    };
  },

  "layout-pill": (root) => {
    const row = root.querySelector<HTMLElement>("[data-profile]")!;
    const pill = root.querySelector<HTMLElement>("[data-pill]")!;
    const l = createLayout({ root: row });
    const set = (on: boolean) => (pill.textContent = on ? "Following" : "Follow");
    pill.addEventListener("click", () => set(pill.textContent === "Follow"));
    return {
      steps: [() => set(true), () => set(false)],
      // As wide as its label at rest, nothing held
      check: () => first(clean(row), expect(pill.scrollWidth <= pill.clientWidth + 1, "its label is cut off")),
      destroy: () => l.destroy(),
    };
  },

  "layout-scroll": (root) => {
    const list = root.querySelector<HTMLElement>("[data-scroller]")!;
    const l = createLayout({ root: list });
    let n = 0;
    return {
      steps: [
        () => list.scrollTo({ top: 300 }),
        () => {
          const row = document.createElement("li");
          row.className = "lc-row";
          row.textContent = `New message ${++n}`;
          list.prepend(row);
        },
        () => live(list)[0]?.remove(),
      ],
      check: () => clean(list),
      destroy: () => l.destroy(),
    };
  },

  "layout-glass": (root) => {
    const tools = root.querySelector<HTMLElement>("[data-tools]")!;
    const l = createLayout({ root: tools });
    const icons = ["♡", "✎", "⌫"];
    let n = 0;
    const add = () => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lc-tool lb lb-interactive";
      b.textContent = icons[n++ % icons.length];
      tools.append(b);
    };
    return {
      steps: [add, add, () => live(tools).at(-1)?.remove()],
      check: () => clean(tools),
      destroy: () => l.destroy(),
    };
  },

  // Frame times while a section opens over five hundred rows: shown, and kept for a script to read
  "layout-bench": (root) => {
    const acc = root.querySelector<HTMLElement>("[data-acc]")!;
    const stats = root.querySelector<HTMLElement>("[data-stats]")!;
    const section = acc.firstElementChild!;
    let frames: number[] = [];
    let last = 0;
    let on = false;
    const tick = (t: number) => {
      if (!on) return;
      if (last) frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    const l = createLayout({
      root: acc,
      onStart: () => {
        frames = [];
        last = 0;
        on = true;
        requestAnimationFrame(tick);
      },
      onRest: () => {
        on = false;
        const sorted = [...frames].sort((a, b) => a - b);
        const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
        const result = { frames: frames.length, median: at(0.5), p95: at(0.95), worst: sorted.at(-1) ?? 0 };
        (window as unknown as { __layoutBench?: unknown[] }).__layoutBench ??= [];
        (window as unknown as { __layoutBench: unknown[] }).__layoutBench.push(result);
        stats.textContent = `${result.frames} frames · median ${result.median.toFixed(1)} ms · p95 ${result.p95.toFixed(1)} ms · worst ${result.worst.toFixed(1)} ms`;
      },
    });
    section.querySelector("button")!.addEventListener("click", () => toggle(section));
    return {
      steps: [() => toggle(section, true), () => toggle(section, false)],
      check: () => clean(acc),
      destroy: () => l.destroy(),
    };
  },
};

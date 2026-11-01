import { SpringAnimator, springs, transitions, createLayout } from "@fluidkit/core";
import { expect, first, sample } from "./check";
import type { Kit, Setup } from "./kit";

/** A CSS transition on a spring, as fast as the springs run: four times longer in slow motion */
const paced = (el: HTMLElement, spring: string) => {
  const seconds = parseFloat(getComputedStyle(el).getPropertyValue(`--fk-${spring}-duration`));
  el.style.transitionDuration = `${seconds / SpringAnimator.timeScale}s`;
};

/** Shown and all the way in: as it is, nothing of coming in left on it */
const fullyIn = (el: HTMLElement, what: string) => {
  const s = getComputedStyle(el);
  const scale = s.scale === "none" ? 1 : parseFloat(s.scale);
  return first(
    expect(s.display !== "none", `${what} isn't shown`),
    expect(Math.abs(parseFloat(s.opacity) - 1) < 0.01, `${what} is at opacity ${s.opacity}`),
    expect(Math.abs(scale - 1) < 0.01, `${what} is at scale ${s.scale}`),
    expect(s.filter === "none", `${what} is still filtered: ${s.filter}`),
  );
};
const gone = (el: HTMLElement, what: string) =>
  expect(getComputedStyle(el).display === "none", `${what} is still shown`);

/** An element's items as the page has them: not one going out */
const live = (root: HTMLElement) =>
  [...root.children].filter((el) => !el.hasAttribute("data-fk-part")) as HTMLElement[];

/** Watches the items' tops every frame from now on: once read, the biggest step any took in a frame */
const steps = (root: HTMLElement) => {
  const seen = sample(() => new Map(live(root).map((el) => [el, el.getBoundingClientRect().top])));
  return () => {
    seen.stop();
    let worst = 0;
    for (let i = 1; i < seen.seen.length; i++) {
      for (const [el, top] of seen.seen[i]) {
        const before = seen.seen[i - 1].get(el);
        if (before !== undefined) worst = Math.max(worst, Math.abs(top - before));
      }
    }
    return worst / SpringAnimator.timeScale;
  };
};

/** Nothing of the layout's left on the list and its rows, a blur included */
const clean = (list: HTMLElement) => {
  const marked = [list, ...live(list)].find(
    (el) => el.style.translate || el.style.opacity || el.style.filter || el.style.willChange || el.style.height,
  );
  return first(
    expect(!list.querySelector(":scope > [data-fk-part][inert]"), "something going out is still in the page"),
    expect(!marked, `the layout's styles still on ${marked === list ? "the list" : "a row"}`),
  );
};

export const motion: Record<string, Setup> = {
  "motion-curve": (root) => {
    const js = root.querySelector<HTMLElement>("[data-js]")!;
    const css = root.querySelector<HTMLElement>("[data-css]")!;
    const far = () => css.parentElement!.clientWidth - css.offsetWidth - 16;
    const spring = new SpringAnimator(
      { x: 0 },
      springs.bouncy(),
      ({ x }) => (js.style.translate = `${x}px 0`),
      undefined,
      0.25,
    );
    let past = () => [0, 0];
    const go = (to: number) => {
      const from = js.getBoundingClientRect().left;
      const seen = sample(() => [js.getBoundingClientRect().left, css.getBoundingClientRect().left]);
      // Slowed down with the rest, never sped up: a frame sped up misses where they turn
      const pace = Math.min(1, SpringAnimator.timeScale);
      const bouncy = springs.bouncy();
      const seconds = parseFloat(getComputedStyle(css).getPropertyValue("--fk-bouncy-duration"));
      css.style.transitionDuration = `${seconds / pace}s`;
      css.style.translate = `${to}px 0`;
      spring.to({ x: to }, { ...bouncy, duration: (bouncy.duration * SpringAnimator.timeScale) / pace });
      // How far each went past where it stops: at the turn it's all but still, so a frame or two
      // between them, or a frame sped up, hardly shows there
      past = () => {
        seen.stop();
        const end = js.getBoundingClientRect().left;
        const sign = Math.sign(end - from);
        return [1, 2].map((k) => Math.max(0, ...seen.seen.map((f) => (f[k - 1] - end) * sign)));
      };
    };
    return {
      steps: [() => go(far()), () => go(0)],
      // The CSS easing is the spring's own curve: it goes past as far, and lands in the same place
      check: (step) => {
        if (step < 0) return null;
        const [jsPast, cssPast] = past();
        const rest = Math.abs(js.getBoundingClientRect().left - css.getBoundingClientRect().left);
        const easing = getComputedStyle(css).transitionTimingFunction;
        return first(
          expect(easing.startsWith("linear("), `the CSS transition eases with ${easing.slice(0, 40)}`),
          expect(jsPast > 5, `the JS spring went only ${jsPast.toFixed(1)}px past`),
          expect(
            Math.abs(jsPast - cssPast) < 3,
            `the CSS spring went ${cssPast.toFixed(1)}px past, the JS one ${jsPast.toFixed(1)}px`,
          ),
          expect(rest < 0.5, `they came to rest ${rest.toFixed(1)}px apart`),
        );
      },
      destroy: () => spring.stop(),
    };
  },

  "motion-popover": (root, kit: Kit) => {
    const pop = root.querySelector<HTMLElement>("[data-pop]")!;
    paced(pop, "bouncy");
    kit.cleanup(() => pop.matches(":popover-open") && pop.hidePopover());
    return {
      steps: [
        () => pop.showPopover(),
        () => pop.hidePopover(),
        () => {
          pop.showPopover();
          kit.later(() => pop.hidePopover(), 80);
        },
        () => pop.showPopover(),
      ],
      check: (step) => {
        if (step === 0 || step === 3) return fullyIn(pop, "the popover");
        if (step === 1 || step === 2)
          return first(expect(!pop.matches(":popover-open"), "the popover is still open"), gone(pop, "the popover"));
        return gone(pop, "the popover");
      },
    };
  },

  "motion-dialog": (root) => {
    const dialog = root.querySelector<HTMLDialogElement>("[data-dialog]")!;
    paced(dialog, "bouncy");
    return {
      steps: [() => dialog.show(), () => dialog.close()],
      check: (step) => (step === 0 ? fullyIn(dialog, "the dialog") : gone(dialog, "the dialog")),
    };
  },

  "motion-hidden": (root, kit: Kit) => {
    const toast = root.querySelector<HTMLElement>("[data-toast]")!;
    paced(toast, "snappy");
    return {
      steps: [
        () => (toast.hidden = false),
        () => (toast.hidden = true),
        () => {
          toast.hidden = false;
          kit.later(() => (toast.hidden = true), 80);
        },
      ],
      check: (step) => (step === 0 ? fullyIn(toast, "the toast") : gone(toast, "the toast")),
    };
  },

  "motion-glass": (root) => {
    const list = root.querySelector<HTMLElement>("[data-list]")!;
    const l = createLayout({ root: list, enter: transitions.blurReplace(), exit: transitions.blurReplace() });
    let n = 0;
    return {
      steps: [
        () => {
          const row = document.createElement("li");
          row.className = live(list)[0].className;
          row.textContent = `New reminder ${++n}`;
          list.prepend(row);
        },
        () => live(list)[0]?.remove(),
      ],
      check: () => clean(list),
      destroy: () => l.destroy(),
    };
  },

  "motion-turn": (root, kit: Kit) => {
    const list = root.querySelector<HTMLElement>("[data-list]")!;
    const l = createLayout({ root: list, enter: transitions.move({ y: 24 }) });
    let worst: (() => number) | null = null;
    let n = 0;
    return {
      steps: [
        () => {
          worst = steps(list);
          const row = document.createElement("li");
          row.className = live(list)[0].className;
          row.textContent = `New reminder ${++n}`;
          list.prepend(row);
          kit.later(() => list.append(row), 100);
        },
      ],
      // Sent to the end coming in, it goes on from where it's laid out, its rise kept: no jump
      check: (step) => {
        if (step < 0) return clean(list);
        const jump = worst?.() ?? 0;
        return first(clean(list), expect(jump < 30, `a row jumped ${jump.toFixed(0)}px in one frame`));
      },
      destroy: () => l.destroy(),
    };
  },
};

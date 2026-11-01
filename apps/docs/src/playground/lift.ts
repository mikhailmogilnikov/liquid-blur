import { createIndicator, createLift, type Lift, type LiftOptions } from "@fluidkit/core";
import { expect, first, liftLayer, same, sample, scaled } from "./check";
import type { Kit, Setup } from "./kit";

/**
 * Every lift case: each target lifts with the case's menu, its highlight an indicator. Gives the
 * lifts back, in the targets' order
 */
const lifts = (root: HTMLElement, kit: Kit, options: Partial<LiftOptions> = {}) => {
  const menu = root.querySelector<HTMLElement>("[data-menu]")!;
  const list = menu.matches(".lc-menu") ? menu : menu.querySelector<HTMLElement>(".lc-menu")!;
  const highlight = createIndicator({
    container: list,
    indicator: list.querySelector<HTMLElement>("[data-highlight]")!,
    items: "[data-item]",
  });
  const made: Lift[] = [...root.querySelectorAll<HTMLElement>("[data-target]")].map((element) =>
    createLift({
      element,
      menu,
      onHighlight: (item) => highlight.to(item && list.contains(item) ? item : null),
      onClose: () => {
        highlight.to(null, { instant: true });
        // Closed by a press on the dim or Escape: the step bar, under the modal, moves past its Close
        kit.skip("Close");
      },
      ...options,
    }),
  );
  kit.cleanup(() => {
    made.forEach((l) => l.destroy());
    highlight.destroy();
  });
  return made;
};

/** Where the steps want it on screen before it lifts: the menu's room is the screen's, not the stage's */
const into = (el: HTMLElement, block: ScrollLogicalPosition) => el.scrollIntoView({ block, behavior: "instant" });

/** What's lifted in the open dialog: after the dim, before the menu */
const liftedOf = () => liftLayer()?.children[1] as HTMLElement | undefined;

/**
 * Lifted as it should be: open, the copy over the element and a little bigger (moved up, `shifted`,
 * when it made room for the menu), the menu on the screen and where it was asked to be
 */
const lifted = (
  element: HTMLElement,
  menu: HTMLElement,
  side: "auto" | "below" | "above" | "left" | "right",
  { shifted = false, scale = 1.04 } = {},
) => {
  const copy = liftedOf();
  if (!liftLayer()?.open || !copy) return "not lifted";
  const got = copy.getBoundingClientRect();
  const want = scaled(element.getBoundingClientRect(), scale);
  const m = menu.getBoundingClientRect();
  // Auto: under it with room there, else over it with room there, as the docs say. The room is the
  // screen's: a short one (a phone's) may have none under an element the page can't scroll up
  const where =
    side !== "auto"
      ? side
      : innerHeight - 12 - (want.bottom + 10) >= m.height || want.top - 10 - 12 < m.height
        ? "below"
        : "above";
  const r = (v: number) => v.toFixed(1);
  return first(
    shifted
      ? first(
          same(
            "the copy, sideways",
            new DOMRect(got.left, 0, got.width, got.height),
            new DOMRect(want.left, 0, want.width, want.height),
          ),
          expect(got.top < want.top - 1, "the copy didn't move up for the menu"),
        )
      : same("the copy", got, want),
    expect(
      m.left >= 11.5 && m.top >= 11.5 && m.right <= innerWidth - 11.5 && m.bottom <= innerHeight - 11.5,
      "the menu is off the screen's margins",
    ),
    where === "below" &&
      expect(Math.abs(m.top - got.bottom - 10) <= 1, `the menu is ${r(m.top - got.bottom)}px under it, not 10`),
    where === "above" &&
      expect(Math.abs(got.top - m.bottom - 10) <= 1, `the menu is ${r(got.top - m.bottom)}px over it, not 10`),
    where === "left" &&
      expect(Math.abs(m.left - got.left) <= 1, `the menu's left is ${r(m.left - got.left)}px from the copy's`),
    where === "right" &&
      expect(Math.abs(m.right - got.right) <= 1, `the menu's right is ${r(m.right - got.right)}px from the copy's`),
  );
};

/** Closed as it should be: no dialog, the element shown and the menu home, hidden */
const closed = (root: HTMLElement, menu: HTMLElement) =>
  first(
    expect(!liftLayer(), "still lifted"),
    expect(!root.querySelector("[data-lifted]"), "an element is still marked lifted"),
    expect(
      ![...root.querySelectorAll<HTMLElement>("[data-target]")].some((t) => t.style.visibility === "hidden"),
      "an element is still hidden",
    ),
    expect(menu.hidden && root.contains(menu), "the menu isn't back, hidden"),
  );

const one: (block: ScrollLogicalPosition, where: "auto" | "below", options?: Partial<LiftOptions>) => Setup =
  (block, where, options) => (root, kit) => {
    const [lift] = lifts(root, kit, options);
    const target = root.querySelector<HTMLElement>("[data-target]")!;
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    return {
      steps: [
        () => {
          into(target, block);
          lift.open();
        },
        () => lift.close(),
      ],
      check: (step) =>
        step === 0
          ? lifted(target, menu, where, { shifted: options?.placement === "below" && block === "end" })
          : closed(root, menu),
    };
  };

export const lift: Record<string, Setup> = {
  // The link's preview: a page of its own, from a template, bigger than the link
  "lift-preview": (root, kit) => {
    const template = root.querySelector<HTMLTemplateElement>("[data-preview]")!;
    const [l] = lifts(root, kit, {
      preview: () => template.content.firstElementChild!.cloneNode(true) as HTMLElement,
    });
    const link = root.querySelector<HTMLElement>("[data-target]")!;
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    // A tap on the link isn't a trip away from the playground
    link.addEventListener("click", (e) => e.preventDefault());
    return {
      steps: [() => l.open(), () => l.close()],
      // Its own size, centered on the link; gone from the page after
      check: (step) => {
        if (step !== 0)
          return first(
            closed(root, menu),
            expect(!document.querySelector(".lc-page"), "the preview is left in the page"),
          );
        const copy = liftedOf();
        if (!copy) return "not lifted";
        const got = copy.getBoundingClientRect();
        const at = link.getBoundingClientRect();
        return first(
          expect(Math.abs(got.width - 300) <= 1, `the preview is ${got.width.toFixed(1)}px wide, not its own 300`),
          expect(
            Math.abs(got.left + got.width / 2 - (at.left + at.width / 2)) <= 1,
            "the preview isn't centered on the link",
          ),
        );
      },
    };
  },

  "lift-keys": (root, kit) => {
    const [l] = lifts(root, kit);
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    return {
      steps: [() => l.open()],
      // The first item that can be chosen is focused, not the disabled one
      check: (step) =>
        step < 0
          ? closed(root, menu)
          : first(
              expect(!!liftLayer()?.open, "not lifted"),
              expect(
                document.activeElement === menu.querySelector("[data-item]:not([aria-disabled='true'])"),
                "the first enabled item isn't focused",
              ),
            ),
    };
  },

  // Open, the page scrolled from outside it, then closed: one step, the modal over the step bar
  "lift-page-scrolls": (root, kit) => {
    const [l] = lifts(root, kit);
    const target = root.querySelector<HTMLElement>("[data-target]")!;
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    // Where the copy and the element were drawn, frame by frame, as it landed
    let landing: ReturnType<typeof sample<[DOMRect, DOMRect] | null>> | null = null;
    kit.cleanup(() => landing?.stop());
    return {
      steps: [
        () => {
          into(target, "center");
          l.open();
          landing = sample(() => {
            const copy = liftedOf();
            return copy ? [copy.getBoundingClientRect(), target.getBoundingClientRect()] : null;
          });
          // Scrolled at once while it's open, then closed while a smooth scroll is still running
          kit.later(() => scrollBy({ top: 140, behavior: "instant" }), 700);
          kit.later(() => {
            scrollBy({ top: 160, behavior: "smooth" });
            l.close();
          }, 1100);
        },
      ],
      check: (step) => {
        if (step < 0 || !landing) return closed(root, menu);
        landing.stop();
        const last = landing.seen.filter(Boolean).at(-1);
        return first(closed(root, menu), last ? same("where the copy landed", last[0], last[1], 1.5) : "never lifted");
      },
    };
  },

  "lift-live": (root, kit) => {
    const [l] = lifts(root, kit);
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    const radio = root.querySelector<HTMLInputElement>("input[value='standard']")!;
    return {
      steps: [() => l.open(), () => l.close()],
      // The page's radio still checked; no frame in the copy to load again
      check: (step) =>
        first(
          expect(radio.checked, "the page's radio was unchecked"),
          step === 0
            ? first(
                expect(!!liftLayer()?.open, "not lifted"),
                expect(!liftLayer()?.querySelector("iframe"), "the copy has a frame, loaded again"),
              )
            : closed(root, menu),
        ),
    };
  },

  "lift-one-at-a-time": (root, kit) => {
    const [one, other] = lifts(root, kit);
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    let dialogs: ReturnType<typeof sample<number>> | null = null;
    kit.cleanup(() => dialogs?.stop());
    return {
      steps: [
        () => {
          dialogs = sample(() => document.querySelectorAll("dialog[data-fk-lift]").length);
          one.open();
          kit.later(() => other.open(), 700);
          kit.later(() => other.close(), 1600);
        },
      ],
      // Never two dims at once
      check: (step) => {
        if (step < 0 || !dialogs) return closed(root, menu);
        dialogs.stop();
        return first(closed(root, menu), expect(Math.max(0, ...dialogs.seen) <= 1, "two lifts were open at once"));
      },
    };
  },

  "lift-below": one("center", "auto"),
  "lift-above": one("end", "auto"),
  // Asked for under it, with no room there: it moves up for the menu
  "lift-tall": one("end", "below", { placement: "below" }),
  // The bubble's copy its size, its text on one line: as tall as the bubble, a little bigger
  "lift-message": (root, kit) => {
    const made = lifts(root, kit);
    const bubble = root.querySelectorAll<HTMLElement>("[data-target]")[1];
    const stack = root.querySelector<HTMLElement>("[data-menu]")!;
    return {
      steps: [() => made[1].open(), () => made[1].close()],
      check: (step) => {
        if (step !== 0) return closed(root, stack);
        const copy = liftedOf();
        return copy
          ? same("the bubble's copy", copy.getBoundingClientRect(), scaled(bubble.getBoundingClientRect(), 1.04))
          : "not lifted";
      },
    };
  },

  "lift-edges": (root, kit) => {
    const [left, right] = lifts(root, kit);
    const [a, b] = root.querySelectorAll<HTMLElement>("[data-target]");
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    return {
      steps: [() => left.open(), () => left.close(), () => right.open(), () => right.close()],
      // On the element's side: left-aligned at the left, right-aligned at the right
      check: (step) =>
        step === 0 ? lifted(a, menu, "left") : step === 2 ? lifted(b, menu, "right") : closed(root, menu),
    };
  },

  // The row in the middle of the list as it's scrolled
  "lift-scrolled": (root, kit) => {
    const made = lifts(root, kit);
    const scroller = root.querySelector<HTMLElement>("[data-scroller]")!;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-target]")];
    const menu = root.querySelector<HTMLElement>("[data-menu]")!;
    let at = 0;
    return {
      steps: [
        () => scroller.scrollBy({ top: 220, behavior: "smooth" }),
        () => {
          const r = scroller.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          at = Math.max(
            0,
            rows.findIndex((row) => {
              const b = row.getBoundingClientRect();
              return b.top <= mid && b.bottom >= mid;
            }),
          );
          made[at].open();
        },
        () => made[at].close(),
      ],
      // Scrolled; then the row lifted from exactly where it's drawn in the scrolled list
      check: (step) =>
        step === 0
          ? expect(scroller.scrollTop > 100, `the list scrolled only ${scroller.scrollTop}px`)
          : step === 1
            ? liftedOf()
              ? same(
                  "the row's copy",
                  liftedOf()!.getBoundingClientRect(),
                  scaled(rows[at].getBoundingClientRect(), 1.04),
                  // A list scrolled smoothly may rest between pixels, and Gecko rounds the row
                  1.5,
                )
              : "not lifted"
            : closed(root, menu),
    };
  },
};

import { createIndicator } from "@fluidkit/core";
import { TextMorph } from "torph";
import { expect, same, sample, unseen } from "./check";
import type { Kit, Setup } from "./kit";

/** A mouse over `el`, as the browser would send it: the indicator hit-tests it as it would a real one */
const hover = (container: HTMLElement, el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  container.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerType: "mouse",
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    }),
  );
};
const leave = (container: HTMLElement) =>
  container.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));

/** A menu whose highlight follows the mouse; the steps point it at the items marked with a step */
const menu: Setup = (root) => {
  const container = root.querySelector<HTMLElement>("[data-menu]")!;
  const highlight = createIndicator({ container, indicator: root.querySelector<HTMLElement>("[data-highlight]")! });
  const marked = [...container.querySelectorAll<HTMLElement>("[data-step]")];
  const shown = root.querySelector<HTMLElement>("[data-highlight]")!;
  return {
    steps: [...marked.map((item) => () => hover(container, item)), () => leave(container)],
    // On the item it was sent to, exactly; away over a disabled one and off the menu
    check: (step) => {
      if (step < 0) return expect(unseen(shown), "shown before anything is pointed at");
      const item = marked[step];
      if (!item || item.getAttribute("aria-disabled") === "true") return expect(unseen(shown), "still shown");
      return unseen(shown)
        ? "not shown"
        : same("the highlight", shown.getBoundingClientRect(), item.getBoundingClientRect());
    },
    destroy: () => highlight.destroy(),
  };
};

/** Tabs with a thumb resting on the chosen one */
const tabs = (root: HTMLElement, onPick?: (tab: HTMLElement) => void) => {
  const container = root.querySelector<HTMLElement>("[data-tabs]")!;
  const all = [...container.querySelectorAll<HTMLButtonElement>("[role='tab']")];
  const thumb = createIndicator({
    container,
    indicator: root.querySelector<HTMLElement>("[data-thumb]")!,
    trigger: "press",
    rest: all.find((t) => t.getAttribute("aria-selected") === "true") ?? null,
    focus: false,
  });
  for (const tab of all) {
    tab.addEventListener("click", () => {
      for (const t of all) t.setAttribute("aria-selected", String(t === tab));
      thumb.rest = tab;
      onPick?.(tab);
    });
  }
  return { all, thumb };
};

export const indicator: Record<string, Setup> = {
  "indicator-menu": menu,
  "indicator-scaled": menu,

  "indicator-tabs": (root) => {
    const panel = root.querySelector<HTMLElement>("[data-panel]")!;
    const { all, thumb } = tabs(root, (tab) => (panel.textContent = tab.dataset.text ?? ""));
    const shown = root.querySelector<HTMLElement>("[data-thumb]")!;
    const order = [1, 2, 0];
    return {
      steps: order.map((i) => () => all[i].click()),
      check: (step) =>
        same("the thumb", shown.getBoundingClientRect(), all[step < 0 ? 0 : order[step]].getBoundingClientRect()),
      destroy: () => thumb.destroy(),
    };
  },

  "indicator-grow": (root) => {
    const { thumb } = tabs(root);
    const shown = root.querySelector<HTMLElement>("[data-thumb]")!;
    const tab = root.querySelector<HTMLElement>("[data-count='unread']")!.closest<HTMLElement>("[role='tab']")!;
    // How far the thumb is from its tab, every frame while the count rolls: a spring behind shows here
    let lag: ReturnType<typeof sample<number>> | null = null;
    const watch = () => {
      lag?.stop();
      lag = sample(() => {
        const a = shown.getBoundingClientRect();
        const b = tab.getBoundingClientRect();
        return Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right));
      });
    };
    const morph = (el: HTMLElement) => {
      const text = new TextMorph({ element: el, ease: { stiffness: 260, damping: 30 } });
      text.update(el.textContent!.trim());
      return text;
    };
    const all = morph(root.querySelector<HTMLElement>("[data-count='all']")!);
    const unread = morph(root.querySelector<HTMLElement>("[data-count='unread']")!);
    const counts = { all: 24, unread: 3 };
    const show = () => {
      all.update(`All ${counts.all}`);
      unread.update(counts.unread ? `Unread ${counts.unread}` : "Unread");
    };
    return {
      steps: [
        () => {
          watch();
          counts.all += 125;
          counts.unread += 125;
          show();
        },
        () => {
          watch();
          counts.unread = 0;
          show();
        },
      ],
      check: (step) => {
        const settled = same("the thumb", shown.getBoundingClientRect(), tab.getBoundingClientRect());
        if (step < 0 || settled || !lag) return settled;
        lag.stop();
        const worst = Math.max(0, ...lag.seen);
        return expect(worst <= 1.5, `the thumb fell ${worst.toFixed(1)}px behind its tab`);
      },
      destroy: () => {
        lag?.stop();
        thumb.destroy();
        all.destroy();
        unread.destroy();
      },
    };
  },

  // Over every item, a frame apart, and off: as a pointer sweeping past
  "indicator-sweep": (root, kit: Kit) => {
    const container = root.querySelector<HTMLElement>("[data-menu]")!;
    const highlight = createIndicator({ container, indicator: root.querySelector<HTMLElement>("[data-highlight]")! });
    const items = [...container.querySelectorAll<HTMLElement>("[role='menuitem']")];
    const shown = root.querySelector<HTMLElement>("[data-highlight]")!;
    return {
      // Gone: faded where the pointer left, not still running through the items
      check: (step) => (step < 0 ? undefined : expect(unseen(shown), "still shown after the pointer left")),
      steps: [
        () => {
          items.forEach((item, i) => kit.later(() => hover(container, item), i * 16));
          kit.later(() => leave(container), items.length * 16);
        },
      ],
      destroy: () => highlight.destroy(),
    };
  },
};

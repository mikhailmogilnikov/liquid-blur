import { createMorph, type Morph } from "@fluidkit/core";
import { unseen } from "./check";
import type { Kit, Setup } from "./kit";

type Entry = { source: HTMLElement; content: HTMLElement; morph: Morph };

/**
 * Every morph case the same way: each control in the scene morphs into the panel it controls, and
 * the steps open them all, close them all, or open and turn back on the way
 */
const scene: Setup = (root, kit: Kit) => {
  const entries: Entry[] = [...root.querySelectorAll<HTMLElement>("[data-morph-source]")].map((source) => {
    const content = root.querySelector<HTMLElement>(`#${source.getAttribute("aria-controls")}`)!;
    const morph = createMorph({
      states: [source, content],
      onStart: (to) => source.setAttribute("aria-expanded", String(to === content)),
      onRest: (at) => {
        // Focus follows: into the panel once open, back to the control once it's there again
        if (at === content) content.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
        else if (content.contains(document.activeElement)) source.focus({ preventScroll: true });
      },
    });
    return { source, content, morph };
  });

  const isOpen = (e: Entry) => e.morph.current === e.content;
  const open = (e: Entry) => e.morph.to(e.content);
  const close = (e: Entry) => isOpen(e) && e.morph.to(e.source);

  for (const entry of entries) {
    entry.source.addEventListener("click", () => (isOpen(entry) ? close(entry) : open(entry)));
    entry.content.addEventListener("click", (e) => {
      const target = e.target as Element;
      // A sort option relabels the control, and its label is the one that flies back into it
      const pick = target.closest<HTMLElement>("[data-pick]");
      if (pick) {
        for (const option of entry.content.querySelectorAll<HTMLElement>("[data-pick]")) {
          option.setAttribute("aria-checked", String(option === pick));
          const label = option.querySelector("span")!;
          if (option === pick) label.dataset.fkMatch = "sort";
          else delete label.dataset.fkMatch;
        }
        entry.source.querySelector<HTMLElement>("[data-label]")!.textContent = pick.textContent!.trim();
      }
      if (pick || target.closest("[data-close]")) close(entry);
    });
    entry.content.addEventListener("submit", (e) => {
      e.preventDefault();
      close(entry);
    });
  }

  // A press anywhere else in the scene closes what's open there; so does Escape
  root.addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    for (const entry of entries) {
      if (!entry.content.contains(target) && !entry.source.contains(target)) close(entry);
    }
  });
  const escape = (e: KeyboardEvent) => {
    if (e.key === "Escape") entries.forEach(close);
  };
  document.addEventListener("keydown", escape);
  kit.cleanup(() => document.removeEventListener("keydown", escape));

  /** The pieces of the page's own (a group's glass): a flight's are gone again once it has landed */
  let parts = 0;
  const pieces = () => root.querySelectorAll("[data-fk-part]").length;

  return {
    // Open after Open; closed at the start, after Close, and after turning back
    check: (step) => {
      if (step < 0) parts = pieces();
      const opened = step === 0;
      for (const e of entries) {
        const at = opened ? e.content : e.source;
        const other = opened ? e.source : e.content;
        if (e.morph.current !== at) return opened ? "not open" : "not closed";
        if (unseen(at)) return `${opened ? "the panel" : "the control"} isn't shown`;
        if (!unseen(other)) return `${opened ? "the control" : "the panel"} is still shown`;
      }
      return pieces() === parts ? null : `${pieces() - parts} piece(s) of a flight left behind`;
    },
    steps: [
      () => entries.forEach(open),
      () => entries.forEach(close),
      // Turned back a third of the way there
      () => {
        entries.forEach(open);
        kit.later(() => entries.forEach(close), 140);
      },
    ],
    destroy: () => entries.forEach((e) => e.morph.destroy()),
  };
};

export const morph: Record<string, Setup> = Object.fromEntries(
  ["corner", "upward", "capsule", "field", "group", "over-group", "squircle", "far", "edges"].map((id) => [
    `morph-${id}`,
    scene,
  ]),
);
